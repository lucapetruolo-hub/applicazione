import { Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import type { PrismaClient } from "@professionisti/database";
import type { SiteCheck, SiteCheckKey, SiteDeadline, SiteDeadlineInput, SiteHealth } from "@professionisti/shared";
import { PRISMA } from "../prisma/prisma.module";
import { ScheduledJob } from "../common/scheduled-job";
import { AuditLogService } from "../audit-log/audit-log.service";
import { frontendUrl } from "../email/email-brand";
import { hasLaunched, launchDate } from "../subscriptions/subscription-rules";

/** Esito di un controllo: `null` se va tutto bene. */
type Outcome = { problem: string; techNote?: string } | null;

const HOUR_MS = 3_600_000;
/** Senza notizie dei pagamenti da più di tanti giorni, dopo il lancio, qualcosa non va. */
export const PAYMENTS_SILENT_DAYS = 7;

/** Apre una pagina del sito: va bene solo una risposta 2xx entro 20 secondi. */
export async function pageOutcome(url: string, fetcher: typeof fetch = fetch): Promise<Outcome> {
  try {
    const response = await fetcher(url, { signal: AbortSignal.timeout(20_000), redirect: "follow" });
    if (response.ok) return null;
    return { problem: "La pagina risponde con un errore: chi la apre non vede niente.", techNote: `${url} → HTTP ${response.status}` };
  } catch (error) {
    return { problem: "La pagina non risponde: chi la apre non vede niente.", techNote: `${url} → ${error instanceof Error ? error.message : String(error)}` };
  }
}

/** Attività a orario finite con un errore, o ferme da più di 2 ore, nelle ultime 26 ore. */
export function scheduledJobsOutcome(runs: { name: string; startedAt: Date; finishedAt: Date | null; error: string | null }[], now: Date, self: string): Outcome {
  const bad = runs.filter((r) => r.name !== self && (r.error !== null || (r.finishedAt === null && now.getTime() - r.startedAt.getTime() > 2 * HOUR_MS)));
  if (bad.length === 0) return null;
  const names = [...new Set(bad.map((r) => r.name))];
  return {
    problem:
      names.length === 1
        ? "Un lavoro automatico del sito non è andato a buon fine. Chiedi a Claude di guardarlo."
        : `${names.length} lavori automatici del sito non sono andati a buon fine. Chiedi a Claude di guardarli.`,
    techNote: bad.map((r) => `${r.name}: ${r.error ?? "non finita"}`).slice(0, 8).join(" · "),
  };
}

/** Dopo il lancio, con i pagamenti accesi: niente notizie dal servizio dei pagamenti da 7 giorni. */
export function paymentsOutcome(lastEventAt: Date | null, now: Date, active: boolean): Outcome {
  if (!active) return null;
  if (lastEventAt && now.getTime() - lastEventAt.getTime() < PAYMENTS_SILENT_DAYS * 24 * HOUR_MS) return null;
  return {
    problem: `Da più di ${PAYMENTS_SILENT_DAYS} giorni non arrivano notizie dei pagamenti. Forse il collegamento si è rotto: pagamenti e abbonamenti potrebbero non aggiornarsi.`,
    // scritte-admin: ok (si legge dentro "Per il tecnico", solo super admin)
    techNote: `Nessun evento in stripe_webhook_events dal ${lastEventAt?.toISOString() ?? "mai"}: controllare l'indirizzo del webhook su Stripe.`,
  };
}

const toDeadline = (row: { id: string; title: string; note: string | null; dueAt: Date; doneAt: Date | null }): SiteDeadline => ({
  id: row.id,
  title: row.title,
  note: row.note,
  dueAt: row.dueAt.toISOString().slice(0, 10),
  doneAt: row.doneAt?.toISOString() ?? null,
});

/**
 * Scadenze del sito e controllo della notte (docs/changelog/2026-11-13-admin-scadenze-controlli.md):
 * ogni notte alle 4 il sito controlla se stesso e salva l'esito; i problemi e
 * le scadenze vicine compaiono in cima a Da fare ai super admin.
 */
@Injectable()
export class SiteHealthService {
  private readonly logger = new Logger(SiteHealthService.name);

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly auditLogService: AuditLogService,
  ) {}

  async getHealth(): Promise<SiteHealth> {
    const [checks, deadlines] = await Promise.all([
      this.prisma.siteCheck.findMany({ orderBy: { key: "asc" } }),
      this.prisma.siteDeadline.findMany({ orderBy: [{ doneAt: { sort: "desc", nulls: "first" } }, { dueAt: "asc" }], take: 50 }),
    ]);
    return {
      checks: checks.map(
        (c): SiteCheck => ({
          id: c.id,
          key: c.key as SiteCheckKey,
          ok: c.ok,
          problem: c.problem,
          techNote: c.techNote,
          failingSince: c.failingSince?.toISOString() ?? null,
          checkedAt: c.checkedAt.toISOString(),
        }),
      ),
      deadlines: deadlines.map(toDeadline),
    };
  }

  async addDeadline(adminUserId: string, input: SiteDeadlineInput): Promise<SiteDeadline> {
    const row = await this.prisma.siteDeadline.create({
      data: { title: input.title, note: input.note ?? null, dueAt: new Date(`${input.dueAt}T00:00:00Z`), createdById: adminUserId },
    });
    await this.auditLogService.record({ entityType: "SiteDeadline", entityId: row.id, fieldName: "created", newValue: `${input.dueAt} ${input.title}`, changedByUserId: adminUserId });
    return toDeadline(row);
  }

  /** "Fatto": la scadenza esce da Da fare e resta nell'elenco come fatta. */
  async markDeadlineDone(adminUserId: string, id: string): Promise<void> {
    const updated = await this.prisma.siteDeadline.updateMany({ where: { id, doneAt: null }, data: { doneAt: new Date(), doneById: adminUserId } });
    if (updated.count === 0) throw new NotFoundException("Scadenza non trovata.");
    await this.auditLogService.record({ entityType: "SiteDeadline", entityId: id, fieldName: "done", newValue: "DONE", changedByUserId: adminUserId });
  }

  async deleteDeadline(adminUserId: string, id: string): Promise<void> {
    const deleted = await this.prisma.siteDeadline.deleteMany({ where: { id } });
    if (deleted.count === 0) throw new NotFoundException("Scadenza non trovata.");
    await this.auditLogService.record({ entityType: "SiteDeadline", entityId: id, fieldName: "deleted", newValue: "DELETED", changedByUserId: adminUserId });
  }

  /** Ogni notte alle 4 (ora di Roma), quando il sito è quasi vuoto. */
  @ScheduledJob("0 4 * * *", { timeZone: "Europe/Rome" })
  async nightlyCheck(now: Date = new Date(), fetcher: typeof fetch = fetch): Promise<Record<SiteCheckKey, Outcome>> {
    const site = frontendUrl();
    const self = `${SiteHealthService.name}.nightlyCheck`;
    const [runs, lastEvent] = await Promise.all([
      this.prisma.cronRun.findMany({ where: { startedAt: { gte: new Date(now.getTime() - 26 * HOUR_MS) } }, select: { name: true, startedAt: true, finishedAt: true, error: true } }),
      this.prisma.stripeWebhookEvent.findFirst({ orderBy: { receivedAt: "desc" }, select: { receivedAt: true } }),
    ]);
    const outcomes: Record<SiteCheckKey, Outcome> = {
      SITE: await pageOutcome(`${site}/`, fetcher),
      SEARCH_PAGE: await pageOutcome(`${site}/cerca`, fetcher),
      SCHEDULED_JOBS: scheduledJobsOutcome(runs, now, self),
      PAYMENTS_EVENTS: paymentsOutcome(lastEvent?.receivedAt ?? null, now, Boolean(process.env.STRIPE_SECRET_KEY) && hasLaunched(now, launchDate())),
    };
    for (const [key, outcome] of Object.entries(outcomes) as [SiteCheckKey, Outcome][]) {
      const previous = await this.prisma.siteCheck.findUnique({ where: { key }, select: { failingSince: true } });
      const failingSince = outcome ? (previous?.failingSince ?? now) : null;
      const data = { ok: outcome === null, problem: outcome?.problem ?? null, techNote: outcome?.techNote ?? null, failingSince, checkedAt: now };
      await this.prisma.siteCheck.upsert({ where: { key }, create: { key, ...data }, update: data });
    }
    const failed = Object.entries(outcomes).filter(([, o]) => o !== null).map(([k]) => k);
    if (failed.length) this.logger.warn(`Controllo della notte: non va ${failed.join(", ")}`);
    return outcomes;
  }
}
