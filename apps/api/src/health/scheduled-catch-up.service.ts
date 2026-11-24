import { Inject, Injectable, Logger, type OnApplicationBootstrap } from "@nestjs/common";
import { DiscoveryService } from "@nestjs/core";
import { SchedulerRegistry } from "@nestjs/schedule";
import type { PrismaClient } from "@professionisti/database";
import { fiscalDeadlineOfJob } from "@professionisti/shared";
import { catchUpJobs, lastExpectedSlot, type CatchUpJob } from "../common/scheduled-job";
import { PRISMA } from "../prisma/prisma.module";

/** Un giro previsto da meno di così può essere ancora in partenza: non è in ritardo. */
const STARTING_GRACE_MS = 10 * 60_000;
/** Un giro partito e non finito da più di così si è fermato a metà (riavvio). */
const STUCK_AFTER_MS = 60 * 60_000;
/**
 * Oltre così un giro finito male non tiene più rosso il controllo: l'email di
 * GitHub è già partita e gli avvisi in Admin restano. Altrimenti un giro del
 * 1° del mese terrebbe rosso l'uptime per un mese, nascondendo un sito giù.
 */
const REPORT_FOR_MS = 48 * 60 * 60_000;
/** `/health/cron` aspetta il recupero all'avvio al massimo così, poi risponde lo stesso. */
const CATCH_UP_WAIT_MS = 60_000;

export interface LateJob {
  job: string;
  expected: string;
  why: "non partita" | "finita con un errore" | "ferma a metà";
  /** Scadenza fiscale a rischio (FISCAL_DEADLINES), se l'attività ne serve una. */
  fiscal?: string;
}

/**
 * Recupero delle attività a orario saltate e controllo "uomo morto"
 * (docs/changelog/2026-11-24-scadenze-fiscali-attivita.md).
 *
 * Sul piano Free di Render l'API si spegne dopo 15 minuti senza visite: un
 * giro delle 7 del 1° del mese non parte e non lascia nessun errore, solo
 * silenzio. All'avvio questo servizio guarda in `cron_runs` le attività con
 * `catchUpWithinMs` e fa partire una volta il giro mancato, con lo stesso
 * orario previsto (`slot`): con due API accese lo fa una sola delle due, e
 * se nel frattempo il giro normale è partito non si ripete.
 *
 * `/health/cron` (chiamato da `.github/workflows/uptime.yml`, fuori
 * dall'API) dice se un'attività non è partita, è finita con un errore o si è
 * fermata a metà: il controllo della notte è anche lui dentro l'API e dorme
 * con lei, questo no.
 */
@Injectable()
export class ScheduledCatchUpService implements OnApplicationBootstrap {
  private readonly logger = new Logger(ScheduledCatchUpService.name);
  private ready: Promise<void> = Promise.resolve();

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly discovery: DiscoveryService,
    private readonly registry: SchedulerRegistry,
  ) {}

  onApplicationBootstrap(): void {
    // Non blocca l'avvio: Render aspetta che l'API risponda.
    this.ready = this.catchUp(new Date()).then(() => undefined, (error: unknown) => {
      this.logger.error(`Recupero delle attività a orario non riuscito: ${error instanceof Error ? error.message : String(error)}`);
    });
  }

  /** Fa partire i giri mancati. Restituisce i nomi delle attività recuperate. */
  async catchUp(now: Date): Promise<string[]> {
    const instances = this.instancesByOwner();
    const recovered: string[] = [];
    for (const job of catchUpJobs) {
      const instance = instances.get(job.owner);
      const expected = this.expectedSlot(job, now);
      if (!instance || !expected) continue;
      const ran = await this.prisma.cronRun.findFirst({ where: { name: job.name, slot: { gte: expected } }, select: { slot: true } });
      if (ran) continue;
      this.logger.warn(`${job.name}: il giro delle ${expected.toISOString()} non è partito (API spenta). Lo faccio adesso.`);
      try {
        if ((await job.run(instance, expected)) === "done") recovered.push(job.name);
      } catch (error) {
        // Un'attività che fallisce non ferma le altre: l'errore resta in `cron_runs` e `/health/cron` lo segnala.
        this.logger.error(`${job.name}: recupero non riuscito: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    return recovered;
  }

  /** Attività in ritardo, dopo aver aspettato il recupero all'avvio. */
  async lateJobs(now: Date = new Date()): Promise<LateJob[]> {
    await Promise.race([this.ready, new Promise((resolve) => setTimeout(resolve, CATCH_UP_WAIT_MS).unref())]);
    const late: LateJob[] = [];
    for (const job of catchUpJobs) {
      const expected = this.expectedSlot(job, now);
      if (!expected) continue;
      const age = now.getTime() - expected.getTime();
      if (age < STARTING_GRACE_MS || age > REPORT_FOR_MS) continue;
      const run = await this.prisma.cronRun.findFirst({
        where: { name: job.name, slot: { gte: expected } },
        orderBy: { slot: "desc" },
        select: { startedAt: true, finishedAt: true, error: true },
      });
      const why = lateReason(run, now);
      const fiscal = fiscalDeadlineOfJob(job.name)?.rule;
      if (why) late.push({ job: job.name, expected: expected.toISOString(), why, ...(fiscal ? { fiscal } : {}) });
    }
    return late;
  }

  private expectedSlot(job: CatchUpJob, now: Date): Date | null {
    let cron: ReturnType<SchedulerRegistry["getCronJob"]>;
    try {
      cron = this.registry.getCronJob(job.name);
    } catch {
      return null;
    }
    const zone = cron.cronTime.timeZone;
    return lastExpectedSlot((from) => cron.cronTime.getNextDateFrom(from, zone).toJSDate(), now, job.withinMs);
  }

  private instancesByOwner(): Map<object, unknown> {
    const owners = new Set(catchUpJobs.map((job) => job.owner));
    const map = new Map<object, unknown>();
    for (const wrapper of this.discovery.getProviders()) {
      const owner = wrapper.metatype as object | null;
      if (owner && owners.has(owner) && wrapper.instance) map.set(owner, wrapper.instance);
    }
    return map;
  }
}

/** Perché un giro previsto non va bene (null se va bene o è ancora in corso). */
export function lateReason(run: { startedAt: Date; finishedAt: Date | null; error: string | null } | null, now: Date): LateJob["why"] | null {
  if (!run) return "non partita";
  if (run.error) return "finita con un errore";
  if (!run.finishedAt && now.getTime() - run.startedAt.getTime() > STUCK_AFTER_MS) return "ferma a metà";
  return null;
}
