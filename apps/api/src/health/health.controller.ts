import { Controller, Get, Inject, ServiceUnavailableException } from "@nestjs/common";
import type { PrismaClient } from "@professionisti/database";
import { onlinePaymentsEnabled } from "../job-payments/online-payments-enabled";
import { PRISMA } from "../prisma/prisma.module";
import { ScheduledCatchUpService } from "./scheduled-catch-up.service";

/** Oltre questo tempo il database è considerato giù: l'uptime riprova da sé. */
const DB_CHECK_TIMEOUT_MS = 3000;

@Controller("health")
export class HealthController {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly catchUp: ScheduledCatchUpService,
  ) {}

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
   * Controllo "uomo morto" delle attività a orario
   * (docs/changelog/2026-11-24-scadenze-fiscali-attivita.md): 503 se
   * un'attività che si recupera all'avvio (fatture del mese, esiti, zip al
   * commercialista) non è partita, è finita con un errore o si è fermata a
   * metà. Lo chiama `.github/workflows/uptime.yml` da fuori, così suona anche
   * quando l'API dormiva. Aspetta prima il recupero all'avvio. Solo nomi
   * delle attività e orari, nessun dato.
   */
  @Get("cron")
  async cron() {
    const late = await this.catchUp.lateJobs();
    if (late.length > 0) throw new ServiceUnavailableException({ status: "error", late });
    return { status: "ok" };
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
