import { createHash } from "node:crypto";
import { Inject, Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import type { PrismaClient } from "@professionisti/database";
import {
  SITE_ADVICE_DONE_DAYS,
  SITE_COUNTERS_RETENTION_MONTHS,
  matchPopularServices,
  normalizeJobTerm,
  type ChurnKind,
  type ChurnReason,
  type DeviceKind,
  type ProfileRequestEvent,
  type ProfileRequestSource,
  type RequestOrigin,
  type RequestStepKey,
  type SubmitFailureKind,
  type SubmitFormKey,
} from "@professionisti/shared";
import { PRISMA } from "../prisma/prisma.module";
import { hasLaunched, launchDate } from "../subscriptions/subscription-rules";

/** Giorni diversi in cui una parola va cercata prima di mostrarla agli admin. */
export const UNKNOWN_JOB_MIN_DAYS = 3;
const UNKNOWN_JOB_WINDOW_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;

function today(now: Date = new Date()): Date {
  const day = new Date(now);
  day.setUTCHours(0, 0, 0, 0);
  return day;
}

export function termHash(term: string): string {
  return createHash("sha256").update(term).digest("hex");
}

/** Primo giorno che si tiene: SITE_COUNTERS_RETENTION_MONTHS mesi fa. */
export function retentionCutoff(now: Date): Date {
  const cutoff = today(now);
  cutoff.setUTCMonth(cutoff.getUTCMonth() - SITE_COUNTERS_RETENTION_MONTHS);
  return cutoff;
}

/**
 * Contatori per giorno dell'andamento del sito (docs/CHANGELOG.md §372):
 * passi della richiesta, invii non riusciti, parole cercate che non sono un
 * lavoro, motivi di chi se ne va. Mai chi è la persona; un errore qui non
 * deve mai fermare quello che la persona sta facendo.
 */
@Injectable()
export class SiteCountsService {
  private readonly logger = new Logger(SiteCountsService.name);

  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  async recordStep(
    step: RequestStepKey,
    categorySlug?: string,
    origin: RequestOrigin = "GENERAL",
    from: { source?: ProfileRequestSource; device?: DeviceKind } = {},
  ): Promise<void> {
    const slug = categorySlug?.trim().toLowerCase() ?? "";
    const day = today();
    await this.prisma.requestStepDay.upsert({
      where: { step_categorySlug_origin_day: { step, categorySlug: slug, origin, day } },
      create: { step, categorySlug: slug, origin, day, count: 1 },
      update: { count: { increment: 1 } },
    });
    // Da quale pulsante del profilo e da che dispositivo (§394): solo l'apertura e l'invio.
    const event: ProfileRequestEvent | null = step === "LAVORO" ? "INIZIATA" : step === "INVIATA" ? "INVIATA" : null;
    if (origin === "PROFILE" && event && from.device) await this.recordProfileSource(event, from.source ?? "ALTRO", from.device);
  }

  /** Un profilo pubblico aperto, per dispositivo (§394). */
  async recordProfileView(device: DeviceKind): Promise<void> {
    await this.recordProfileSource("VISITA", "", device);
  }

  /**
   * Contatore delle richieste dai profili (§394). Solo dal lancio: le prove
   * fatte prima non devono finire nei numeri veri; senza `LAUNCH_DATE` non
   * si conta niente.
   */
  private async recordProfileSource(event: ProfileRequestEvent, source: ProfileRequestSource | "", device: DeviceKind, now: Date = new Date()): Promise<void> {
    if (!hasLaunched(now, launchDate())) return;
    const day = today(now);
    await this.prisma.profileRequestSourceDay.upsert({
      where: { event_source_device_day: { event, source, device, day } },
      create: { event, source, device, day, count: 1 },
      update: { count: { increment: 1 } },
    });
  }

  async recordFailure(form: SubmitFormKey, kind: SubmitFailureKind): Promise<void> {
    const day = today();
    await this.prisma.submitFailureDay.upsert({
      where: { form_kind_day: { form, kind, day } },
      create: { form, kind, day, count: 1 },
      update: { count: { increment: 1 } },
    });
  }

  /**
   * Una parola cercata che non trova nessun lavoro né professionista (es.
   * "antennista"). Per giorno si salva solo l'impronta; la parola si salva
   * quando è stata cercata in UNKNOWN_JOB_MIN_DAYS giorni diversi negli
   * ultimi 90, così una ricerca isolata (magari un nome) non resta mai.
   */
  async recordUnknownJobSearch(text: string): Promise<void> {
    const term = normalizeJobTerm(text);
    if (!term) return;
    const hash = termHash(term);
    const day = today();
    await this.prisma.unknownJobSearchDay.upsert({
      where: { termHash_day: { termHash: hash, day } },
      create: { termHash: hash, day, count: 1 },
      update: { count: { increment: 1 } },
    });
    const days = await this.prisma.unknownJobSearchDay.count({
      where: { termHash: hash, day: { gte: new Date(day.getTime() - UNKNOWN_JOB_WINDOW_DAYS * DAY_MS) } },
    });
    if (days >= UNKNOWN_JOB_MIN_DAYS) {
      await this.prisma.unknownJobTerm.upsert({ where: { termHash: hash }, create: { termHash: hash, term }, update: {} });
    }
  }

  /**
   * Una ricerca scritta che corrisponde a prestazioni dell'elenco suggerito
   * (§384): si conta il nome dell'elenco, mai il testo cercato.
   */
  async recordServiceSearch(text: string, categorySlug?: string): Promise<void> {
    const matches = matchPopularServices(text, categorySlug?.trim().toLowerCase() || undefined);
    const day = today();
    for (const m of matches) {
      await this.prisma.serviceSearchDay.upsert({
        where: { categorySlug_service_day: { categorySlug: m.categorySlug, service: m.service, day } },
        create: { categorySlug: m.categorySlug, service: m.service, day, count: 1 },
        update: { count: { increment: 1 } },
      });
    }
  }

  async recordChurnReason(kind: ChurnKind, reason: ChurnReason): Promise<void> {
    const day = today();
    await this.prisma.churnReasonDay.upsert({
      where: { kind_reason_day: { kind, reason, day } },
      create: { kind, reason, day, count: 1 },
      update: { count: { increment: 1 } },
    });
  }

  /**
   * Ogni notte alle 3: i contatori più vecchi di SITE_COUNTERS_RETENTION_MONTHS
   * mesi si cancellano (§372, scritto nell'informativa privacy), e con loro le
   * parole che non hanno più nessun giorno.
   */
  @Cron("0 3 * * *", { timeZone: "Europe/Rome" })
  async deleteOldCounters(now: Date = new Date()): Promise<number> {
    const before = { day: { lt: retentionCutoff(now) } };
    const results = await Promise.all([
      this.prisma.categorySearchDay.deleteMany({ where: before }),
      this.prisma.freeSearchDay.deleteMany({ where: before }),
      this.prisma.profileViewDay.deleteMany({ where: before }),
      this.prisma.requestStepDay.deleteMany({ where: before }),
      this.prisma.profileRequestSourceDay.deleteMany({ where: before }),
      this.prisma.submitFailureDay.deleteMany({ where: before }),
      this.prisma.unknownJobSearchDay.deleteMany({ where: before }),
      this.prisma.serviceSearchDay.deleteMany({ where: before }),
      this.prisma.churnReasonDay.deleteMany({ where: before }),
      // Consigli segnati come fatti: servono solo per SITE_ADVICE_DONE_DAYS giorni.
      this.prisma.siteAdviceDone.deleteMany({ where: { doneAt: { lt: new Date(now.getTime() - SITE_ADVICE_DONE_DAYS * DAY_MS) } } }),
    ]);
    const kept = await this.prisma.unknownJobSearchDay.findMany({ distinct: ["termHash"], select: { termHash: true } });
    const orphans = await this.prisma.unknownJobTerm.deleteMany({ where: { termHash: { notIn: kept.map((d) => d.termHash) } } });
    const deleted = results.reduce((sum, r) => sum + r.count, 0) + orphans.count;
    if (deleted) this.logger.log(`Contatori più vecchi di ${SITE_COUNTERS_RETENTION_MONTHS} mesi cancellati: ${deleted}`);
    return deleted;
  }
}
