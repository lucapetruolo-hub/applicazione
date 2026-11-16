import { Logger } from "@nestjs/common";
import { prisma } from "@professionisti/database";

/**
 * Tetto giornaliero alle chiamate a pagamento (Google, intelligenza
 * artificiale) che partono da rotte aperte a tutti (docs/CHANGELOG.md §293):
 * il limite per IP non basta contro chi usa tanti indirizzi IP. Il conteggio
 * riparte a mezzanotte (ora UTC). `GOOGLE_PUBLIC_DAILY_LIMIT` su Render
 * cambia il tetto di tutte le voci di Google (0 = nessuna chiamata).
 *
 * Con un nome il conteggio sta nel database (tabella `daily_budget_usage`,
 * docs/changelog/2026-11-16-traffico-elevato.md): vale uguale per tutte le
 * copie dell'API e non riparte da zero a ogni aggiornamento. Prima era in
 * memoria: con tre copie il tetto, e la spesa, diventavano tre volte tanto.
 * Senza nome (prove) resta in memoria.
 */
export interface DailyBudgetStore {
  /** Conta una chiamata se `used < limit`; restituisce `false` se il tetto è pieno. */
  take(name: string, day: string, limit: number): Promise<boolean>;
  used(name: string, day: string): Promise<number>;
}

export class MemoryBudgetStore implements DailyBudgetStore {
  private readonly counts = new Map<string, number>();

  async take(name: string, day: string, limit: number): Promise<boolean> {
    const key = `${name}|${day}`;
    const used = this.counts.get(key) ?? 0;
    if (used >= limit) return false;
    this.counts.set(key, used + 1);
    return true;
  }

  async used(name: string, day: string): Promise<number> {
    return this.counts.get(`${name}|${day}`) ?? 0;
  }
}

const logger = new Logger("TettoGiornaliero");

/** Giorni di conteggi tenuti nella tabella: servono solo quelli di oggi. */
const KEEP_DAYS = 7;

export const prismaBudgetStore: DailyBudgetStore = {
  async take(name, day, limit) {
    // Un solo passaggio atomico: due copie dell'API che contano insieme non
    // superano mai il tetto.
    const rows = await prisma.$queryRaw<{ used: number }[]>`
      INSERT INTO daily_budget_usage (name, day, used) VALUES (${name}, ${day}::date, 1)
      ON CONFLICT (name, day) DO UPDATE SET used = daily_budget_usage.used + 1
      WHERE daily_budget_usage.used < ${limit}
      RETURNING used`;
    // Ogni tanto si tolgono i giorni vecchi: nessuna attività a orario in più.
    if (Math.random() < 0.01) {
      void prisma.$executeRaw`DELETE FROM daily_budget_usage WHERE day < (${day}::date - ${KEEP_DAYS}::int)`.catch(() => undefined);
    }
    return rows.length > 0;
  },
  async used(name, day) {
    const rows = await prisma.$queryRaw<{ used: number }[]>`SELECT used FROM daily_budget_usage WHERE name = ${name} AND day = ${day}::date`;
    return rows[0]?.used ?? 0;
  },
};

let sharedStore: DailyBudgetStore = prismaBudgetStore;

/** Solo per le prove (`src/test-setup.ts`): dove stanno i tetti con un nome. */
export function setSharedBudgetStore(store: DailyBudgetStore): void {
  sharedStore = store;
}

/** Deposito dei tetti con un nome: il database, tranne nelle prove. */
export function sharedBudgetStore(): DailyBudgetStore {
  return sharedStore;
}

export class DailyBudget {
  private warnedDay = "";
  private readonly memory = new MemoryBudgetStore();
  private readonly name: string;

  constructor(
    private readonly defaultLimit: number,
    private readonly onExhausted?: () => void,
    /** Variabile che cambia il tetto di questa voce (per l'intelligenza artificiale non è quella di Google). */
    private readonly envName = "GOOGLE_PUBLIC_DAILY_LIMIT",
    /** Nome della voce nel database; senza, il conteggio resta in memoria. */
    private readonly sharedName?: string,
    private readonly customStore?: DailyBudgetStore,
  ) {
    this.name = sharedName ?? "memoria";
  }

  private get store(): DailyBudgetStore {
    return this.customStore ?? (this.sharedName ? sharedBudgetStore() : this.memory);
  }

  private limit(): number {
    const raw = process.env[this.envName]?.trim();
    const parsed = raw ? Number(raw) : NaN;
    return Number.isInteger(parsed) && parsed >= 0 ? parsed : this.defaultLimit;
  }

  /** Chiamate usate oggi e tetto, per Admin. */
  async usage(now: Date = new Date()): Promise<{ used: number; limit: number }> {
    return { used: await this.safeUsed(now), limit: this.limit() };
  }

  /** `true` se oggi resta almeno una chiamata, senza contarla. */
  async hasRoom(now: Date = new Date()): Promise<boolean> {
    return (await this.safeUsed(now)) < this.limit();
  }

  /** `true` se la chiamata rientra nel tetto di oggi (e la conta). */
  async take(now: Date = new Date()): Promise<boolean> {
    const today = now.toISOString().slice(0, 10);
    const limit = this.limit();
    let allowed: boolean;
    try {
      allowed = limit > 0 && (await this.store.take(this.name, today, limit));
    } catch (error) {
      // Database irraggiungibile: niente chiamata a pagamento, meglio che una
      // spesa senza tetto.
      logger.error(`Tetto "${this.name}" non leggibile: chiamata non fatta. ${error instanceof Error ? error.message : ""}`);
      return false;
    }
    if (!allowed && this.warnedDay !== today) {
      this.warnedDay = today;
      this.onExhausted?.();
    }
    return allowed;
  }

  private async safeUsed(now: Date): Promise<number> {
    try {
      return await this.store.used(this.name, now.toISOString().slice(0, 10));
    } catch {
      return this.limit();
    }
  }
}
