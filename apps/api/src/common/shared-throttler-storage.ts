import { createHash } from "node:crypto";
import { Injectable, Logger } from "@nestjs/common";
import { type ThrottlerStorage, ThrottlerStorageService } from "@nestjs/throttler";
import { prisma } from "@professionisti/database";

/**
 * Limiti al minuto validi per tutte le copie dell'API (test di sicurezza del
 * 25/11, docs/changelog/2026-11-25-correzioni-test-sicurezza.md). Prima ogni
 * copia contava per conto suo in memoria: con due copie il limite
 * dell'accesso (10 al minuto) diventava 20, e a ogni aggiornamento ripartiva
 * da zero. Regola del traffico elevato: niente stato solo in memoria che
 * debba valere per tutti.
 *
 * Nel database vanno solo i limiti stretti (fino a STRICT_LIMIT al minuto:
 * accesso, registrazione, recupero password, contatti, foto…), che si usano
 * poco: il limite generale di 60 al minuto, toccato da ogni chiamata, resta
 * in memoria per non scrivere nel database a ogni richiesta. Se il database
 * non risponde si conta in memoria, così un problema del database non
 * blocca gli accessi.
 */
export const STRICT_LIMIT = 20;

type ThrottlerStorageRecord = Awaited<ReturnType<ThrottlerStorage["increment"]>>;

export interface SharedHitStore {
  /** Conta una chiamata nella finestra di `ttlMs` e restituisce chiamate fatte e millisecondi alla fine della finestra. */
  hit(key: string, ttlMs: number): Promise<{ hits: number; msLeft: number }>;
}

export const prismaHitStore: SharedHitStore = {
  async hit(key, ttlMs) {
    // Un solo passaggio atomico: finestra scaduta → riparte da 1.
    const rows = await prisma.$queryRaw<{ hits: number; msLeft: number }[]>`
      INSERT INTO rate_limit_hits (key, hits, "expiresAt") VALUES (${key}, 1, now() + (${ttlMs}::int * interval '1 millisecond'))
      ON CONFLICT (key) DO UPDATE SET
        hits = CASE WHEN rate_limit_hits."expiresAt" <= now() THEN 1 ELSE rate_limit_hits.hits + 1 END,
        "expiresAt" = CASE WHEN rate_limit_hits."expiresAt" <= now() THEN now() + (${ttlMs}::int * interval '1 millisecond') ELSE rate_limit_hits."expiresAt" END
      RETURNING hits, GREATEST(0, EXTRACT(EPOCH FROM ("expiresAt" - now())) * 1000)::int AS "msLeft"`;
    // Ogni tanto si tolgono le finestre finite: nessuna attività a orario in più.
    if (Math.random() < 0.01) {
      void prisma.$executeRaw`DELETE FROM rate_limit_hits WHERE "expiresAt" < now() - interval '1 hour'`.catch(() => undefined);
    }
    const row = rows[0];
    return { hits: row?.hits ?? 1, msLeft: row?.msLeft ?? ttlMs };
  },
};

let sharedHitStore: SharedHitStore | null = prismaHitStore;

/** Solo per le prove (`src/test-setup.ts`): `null` = tutto in memoria. */
export function setSharedHitStore(store: SharedHitStore | null): void {
  sharedHitStore = store;
}

@Injectable()
export class SharedThrottlerStorage implements ThrottlerStorage {
  private readonly logger = new Logger("LimitiAlMinuto");
  private readonly memory = new ThrottlerStorageService();
  private warned = false;

  async increment(key: string, ttl: number, limit: number, blockDuration: number, throttlerName: string): Promise<ThrottlerStorageRecord> {
    const store = sharedHitStore;
    if (!store || limit > STRICT_LIMIT) return this.memory.increment(key, ttl, limit, blockDuration, throttlerName);
    try {
      // La chiave di Nest contiene già un'impronta di rotta e indirizzo; la si ripassa per tenerla corta.
      const id = createHash("sha256").update(`${throttlerName}|${key}`).digest("base64url");
      const { hits, msLeft } = await store.hit(id, ttl);
      const seconds = Math.ceil(msLeft / 1000);
      const isBlocked = hits > limit;
      return { totalHits: hits, timeToExpire: seconds, isBlocked, timeToBlockExpire: isBlocked ? seconds : 0 };
    } catch (error) {
      if (!this.warned) {
        this.warned = true;
        this.logger.warn(`Limiti stretti contati in memoria, il database non risponde: ${error instanceof Error ? error.message : String(error)}`);
      }
      return this.memory.increment(key, ttl, limit, blockDuration, throttlerName);
    }
  }
}
