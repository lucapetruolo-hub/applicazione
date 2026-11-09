import { Controller, Get, Inject, ServiceUnavailableException } from "@nestjs/common";
import type { PrismaClient } from "@professionisti/database";
import { onlinePaymentsEnabled } from "../job-payments/online-payments-enabled";
import { PRISMA } from "../prisma/prisma.module";

/** Oltre questo tempo il database è considerato giù: l'uptime riprova da sé. */
const DB_CHECK_TIMEOUT_MS = 3000;

@Controller("health")
export class HealthController {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  /**
   * Controllo leggero di Render (`healthCheckPath`): risponde se il processo è
   * su. Non tocca il database, così un rallentamento del database non fa
   * riavviare l'API.
   */
  @Get()
  check() {
    return { status: "ok" };
  }

  /**
   * Il database risponde? (docs/changelog/2026-11-08-infrastruttura-lancio.md)
   * Il 05/11/2026 `/health` era verde mentre ogni pagina dava errore perché il
   * database era scaduto. Lo usa `.github/workflows/uptime.yml`: 503 se il
   * database non risponde entro 3 secondi, e GitHub manda l'email.
   */
  @Get("db")
  async database() {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("timeout")), DB_CHECK_TIMEOUT_MS);
    });
    try {
      await Promise.race([this.prisma.$queryRaw`SELECT 1`, timeout]);
      return { status: "ok", database: "ok" };
    } catch {
      throw new ServiceUnavailableException({ status: "error", database: "non risponde" });
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Funzioni attive su questo ambiente, lette dal sito per non promettere ciò
   * che non funziona (docs/CHANGELOG.md §170): senza chiave Stripe il
   * pagamento online dei lavori non viene offerto.
   */
  @Get("features")
  features() {
    return { onlinePayments: onlinePaymentsEnabled() };
  }
}
