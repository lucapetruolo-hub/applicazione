import { Inject, Injectable, Logger } from "@nestjs/common";
import type { PrismaClient } from "@professionisti/database";
import { PRISMA } from "../prisma/prisma.module";
import { EmailService } from "../email/email.service";
import { adminMaintenanceEmail } from "../email/templates/account-emails";
import { ScheduledJob } from "../common/scheduled-job";

/** Avviso 6 mesi prima della fine del supporto, come per Node (scripts/controlla-node.mjs). */
const NOTICE_MONTHS = 6;

/**
 * Fine del supporto di PostgreSQL (docs/changelog/2026-10-30-admin-persone.md,
 * richiesta di Luca del 02/11/2026). Il database su Render non sta nel
 * repository: la sua versione si legge solo da dentro, quindi la controlla
 * l'API, il primo del mese, con il calendario di endoflife.date. Se mancano
 * meno di 6 mesi manda un'email ai super admin. Un errore (sito del
 * calendario giù) non fa niente: si riprova il mese dopo.
 */
export function postgresNotice(serverVersionNum: number, cycles: { cycle: string; eol: string | boolean }[], now: Date): { title: string; paragraphs: string[] } | null {
  const major = Math.floor(serverVersionNum / 10000);
  const ours = cycles.find((c) => c.cycle === String(major));
  if (!ours || typeof ours.eol !== "string") return null;
  const end = new Date(`${ours.eol}T00:00:00Z`);
  const limit = new Date(now);
  limit.setUTCMonth(limit.getUTCMonth() + NOTICE_MONTHS);
  if (end > limit) return null;
  const newest = cycles.map((c) => Number(c.cycle)).filter((n) => Number.isFinite(n) && n > major).sort((a, b) => b - a)[0];
  const when = end.toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  const past = end < now;
  return {
    title: "Il database del sito va aggiornato",
    paragraphs: [
      `Il programma che conserva i dati del sito (versione ${major}) ${past ? "non riceve più correzioni di sicurezza dal" : "riceve correzioni di sicurezza solo fino al"} ${when}.`,
      "Chiedi a Claude, in un thread dedicato, di prepararlo: si fa una copia dei dati e si sceglie un'ora con poca gente sul sito.",
      // scritte-admin: ok (dettaglio per chi fa l'aggiornamento)
      `Per il tecnico: PostgreSQL ${major} su Render${newest ? `, passare alla ${newest} dalla voce per l'aggiornamento della versione del database` : ""}.`,
    ],
  };
}

@Injectable()
export class DatabaseVersionService {
  private readonly logger = new Logger(DatabaseVersionService.name);

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly emailService: EmailService,
  ) {}

  @ScheduledJob("0 9 1 * *", { timeZone: "Europe/Rome" })
  async monthlyCheck(now: Date = new Date()): Promise<boolean> {
    try {
      const [row] = await this.prisma.$queryRaw<{ server_version_num: string }[]>`SELECT current_setting('server_version_num') AS server_version_num`;
      const response = await fetch("https://endoflife.date/api/postgresql.json", { signal: AbortSignal.timeout(10_000) });
      if (!row || !response.ok) return false;
      const notice = postgresNotice(Number(row.server_version_num), (await response.json()) as { cycle: string; eol: string | boolean }[], now);
      if (!notice) return false;
      const supers = await this.prisma.user.findMany({
        where: { role: "ADMIN", deletedAt: null, email: { not: null }, OR: [{ adminRoles: { has: "SUPER" } }, { adminRoles: { isEmpty: true } }] },
        select: { name: true, email: true },
      });
      for (const admin of supers) {
        if (admin.email) await this.emailService.send({ to: admin.email, ...adminMaintenanceEmail(admin.name, { ...notice, url: "https://endoflife.date/postgresql" }) });
      }
      this.logger.warn(notice.paragraphs[0]);
      return true;
    } catch (error) {
      this.logger.warn(`Controllo della versione del database non riuscito: ${error instanceof Error ? error.message : error}`);
      return false;
    }
  }
}
