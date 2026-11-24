import { Logger } from "@nestjs/common";
import { Cron, type CronOptions } from "@nestjs/schedule";
import { Prisma, prisma } from "@professionisti/database";

/**
 * Attività a orario del sito (docs/changelog/2026-11-08-infrastruttura-lancio.md),
 * al posto di `@Cron` di Nest. Fa tre cose in più:
 *
 * - **ora italiana** di serie (`timeZone: "Europe/Rome"`): su Render il fuso è
 *   UTC e "alle 9" partiva alle 10 d'inverno e alle 11 d'estate;
 * - **mai due giri insieme sulla stessa API** (`waitForCompletion`): se un giro
 *   dura più dell'intervallo, quello dopo si salta;
 * - **un solo giro anche con due API accese**: durante un deploy Render tiene
 *   la vecchia istanza finché la nuova non risponde, e per qualche momento
 *   entrambe hanno gli stessi orari. Ogni giro scrive prima una riga in
 *   `cron_runs` (attività + minuto): chi la scrive per primo lavora, l'altra
 *   salta. Niente promemoria, riepiloghi o estratti doppi.
 *
 * La riga dice anche quando l'attività è finita e con quale errore
 * (docs/ops/attivita-a-orario.md). Il metodo del servizio resta quello di
 * prima: le prove e i pulsanti di Admin lo chiamano direttamente, senza
 * passare dalla riga; il giro a orario usa un metodo nascosto accanto.
 */
export function ScheduledJob(cronTime: string, options: ScheduledJobOptions = {}): MethodDecorator {
  return (target, key, descriptor) => {
    const original = descriptor.value as unknown as (this: unknown) => Promise<unknown> | unknown;
    const name = `${target.constructor.name}.${String(key)}`;
    const { catchUpWithinMs, ...cronOptions } = options;
    const wrapper = async function (this: unknown): Promise<void> {
      await runScheduled(name, new Date(), () => original.call(this), prismaCronRunStore);
    };
    if (catchUpWithinMs) {
      catchUpJobs.push({
        name,
        owner: target.constructor,
        withinMs: catchUpWithinMs,
        run: (instance, slot) => runScheduled(name, slot, () => original.call(instance), prismaCronRunStore),
      });
    }
    const hiddenKey = `${String(key)}__aOrario`;
    Object.defineProperty(target, hiddenKey, { value: wrapper, writable: true, configurable: true, enumerable: false });
    Cron(cronTime, { timeZone: "Europe/Rome", waitForCompletion: true, name, ...cronOptions } as CronOptions)(
      target,
      hiddenKey,
      { value: wrapper, writable: true, configurable: true, enumerable: false } as TypedPropertyDescriptor<typeof wrapper>,
    );
    return descriptor;
  };
}

export type ScheduledJobOptions = CronOptions & {
  /**
   * Recupero all'avvio (docs/changelog/2026-11-24-scadenze-fiscali-attivita.md):
   * se l'API era spenta all'orario (piano Free di Render, riavvio, deploy) e
   * da allora sono passati meno di questi millisecondi, il giro mancato parte
   * appena l'API si riaccende (`ScheduledCatchUpService`). Solo per le
   * attività "a stato", che fanno tutto quello che manca e non creano
   * doppioni (fatture del mese, esiti, zip): mai per un promemoria a orario
   * fisso, che il giorno dopo non serve più.
   */
  catchUpWithinMs?: number;
};

/** Un'attività che si recupera all'avvio: il servizio la cerca tra i provider di Nest. */
export interface CatchUpJob {
  name: string;
  owner: object;
  withinMs: number;
  run(instance: unknown, slot: Date): Promise<"done" | "skipped">;
}

/** Attività con `catchUpWithinMs`, registrate dal decoratore al caricamento delle classi. */
export const catchUpJobs: CatchUpJob[] = [];

/**
 * Ultimo orario previsto entro `withinMs` prima di `now` (null se nessuno).
 * `next` è il prossimo orario dell'attività dopo un istante (da `CronTime`).
 */
export function lastExpectedSlot(next: (from: Date) => Date, now: Date, withinMs: number): Date | null {
  let last: Date | null = null;
  let cursor = new Date(now.getTime() - withinMs);
  for (let i = 0; i < 1000; i += 1) {
    const at = next(cursor);
    if (at.getTime() > now.getTime()) break;
    last = cronSlot(at);
    cursor = at;
  }
  return last;
}

/** Dove si segnano i giri: il database in produzione, una mappa nelle prove. */
export interface CronRunStore {
  /** `false` se il giro di quel minuto l'ha già preso un'altra API. */
  claim(name: string, slot: Date): Promise<boolean>;
  finish(name: string, slot: Date, error: string | null): Promise<void>;
}

const logger = new Logger("AttivitaAOrario");

/** Minuto del giro: due API che partono nello stesso minuto scrivono la stessa riga. */
export function cronSlot(at: Date): Date {
  return new Date(Math.floor(at.getTime() / 60_000) * 60_000);
}

export async function runScheduled(name: string, at: Date, job: () => Promise<unknown> | unknown, store: CronRunStore): Promise<"done" | "skipped"> {
  const slot = cronSlot(at);
  // Se il database non risponde il giro non parte (fallirebbe comunque):
  // l'errore va nei log e in Sentry come gli altri.
  if (!(await store.claim(name, slot))) {
    logger.log(`${name}: giro delle ${slot.toISOString()} già fatto da un'altra istanza, saltato.`);
    return "skipped";
  }
  try {
    await job();
    await store.finish(name, slot, null).catch(() => undefined);
    return "done";
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await store.finish(name, slot, message.slice(0, 500)).catch(() => undefined);
    throw error;
  }
}

export const prismaCronRunStore: CronRunStore = {
  async claim(name, slot) {
    try {
      await prisma.cronRun.create({ data: { name, slot } });
      return true;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return false;
      throw error;
    }
  },
  async finish(name, slot, error) {
    await prisma.cronRun.update({ where: { name_slot: { name, slot } }, data: { finishedAt: new Date(), error } });
  },
};

/** Giorni di righe in `cron_runs`: abbastanza per vedere se il giro del 1° del mese è partito. */
export const CRON_RUNS_KEEP_DAYS = 40;
