import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { ModuleRef } from "@nestjs/core";
import type { PrismaClient } from "@professionisti/database";
import { PRISMA } from "../prisma/prisma.module";
import { AuditLogService } from "../audit-log/audit-log.service";
import { CompletionDeadlineService } from "../bookings/completion-deadline.service";
import { BookingRemindersService } from "../booking-reminders/booking-reminders.service";
import { GuidedRequestsService } from "../guided-requests/guided-requests.service";
import { JobIssueOutcomeService } from "../job-issues/job-issue-outcome.service";
import { OnlineMoneyService } from "../job-payments/online-money.service";

const DAY_MS = 24 * 60 * 60 * 1000;

// Le date che contano per i controlli a tempo, modello per modello. Mai
// updatedAt (la scrive Prisma) e mai la cronologia della chat: si sposta
// solo ciò che decide promemoria, scadenze e sblocchi.
const BOOKING_DATES = [
  "scheduledAt",
  "scheduledEndAt",
  "reminderSentAt",
  "createdAt",
  "professionalCompletedAt",
  "completionDeclarationAcceptedAt",
  "clientConfirmedCompletedAt",
  "completionAutoClosedAt",
  "refundRequestedAt",
  "onTheWayAt",
] as const;
const PAYMENT_DATES = [
  "depositPaidAt",
  "depositKeptAt",
  "balancePaidAt",
  "releaseDueAt",
  "releasedAt",
  "balanceUnpaidAt",
  "stripeDisputedAt",
  "stripeDisputeDueBy",
  "disputeReminderSentAt",
  "disputeProNoteAt",
  "disputeProReminderSentAt",
  "stripeDisputeClosedAt",
  "disputeEvidenceSentAt",
  "payoutSentAt",
  "payoutPaidAt",
  "payoutFailedAt",
  "longHoldAlertedAt",
  "balanceAutoChargedAt",
  "balanceAutoChargeFailedAt",
  "directReportedAt",
  "directConfirmedAt",
  "createdAt",
] as const;
const ISSUE_DATES = ["professionalRespondedAt", "resolvedAt", "escalatedAt", "infoRequestedAt", "infoRespondedAt", "appealedAt", "appealResolvedAt", "createdAt"] as const;
const REQUEST_DATES = ["createdAt", "preferredDate", "expiresAt", "hiddenAt", "deletedByClientAt", "forwardedAt", "forwardAt"] as const;
const QUOTE_DATES = ["estimatedStartDate", "estimatedEndDate", "clientProposedDate", "clientProposedEndDate", "resentAt", "previousStartDate", "previousEndDate", "createdAt"] as const;
const LEAD_DATES = ["expiresAt", "hiddenByProfessionalAt", "createdAt"] as const;

/** Le date presenti di `row`, tutte indietro di `ms`: per un controllo a tempo è come se fossero passati quei giorni. */
export function shiftedDates<K extends string>(row: Partial<Record<K, Date | null>>, fields: readonly K[], ms: number): Partial<Record<K, Date>> {
  const data: Partial<Record<K, Date>> = {};
  for (const field of fields) {
    const value = row[field];
    if (value instanceof Date) data[field] = new Date(value.getTime() - ms);
  }
  return data;
}

function selectOf<K extends string>(fields: readonly K[]): { id: true } & Record<K, true> {
  return Object.fromEntries(["id", ...fields].map((field) => [field, true])) as { id: true } & Record<K, true>;
}

const TEST_USER = { testAccountAt: { not: null } } as const;

/**
 * "Fai passare il tempo" (richiesta di Luca per il collaudo,
 * docs/changelog/2026-10-29-collaudo-tempo.md): sposta indietro di N giorni
 * le date di richieste, preventivi, lavori, pagamenti e segnalazioni di un
 * account di prova, poi fa girare subito i controlli a tempo (promemoria,
 * chiusura d'ufficio, sblocco dei soldi, scadenze delle segnalazioni).
 * Tocca solo ciò in cui TUTTE le persone coinvolte sono account di prova,
 * mai un utente vero; con le chiavi Stripe vere rifiuta i lavori pagati online.
 */
@Injectable()
export class TestTimeService {
  private readonly logger = new Logger(TestTimeService.name);

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly auditLogService: AuditLogService,
    private readonly moduleRef: ModuleRef,
  ) {}

  async moveForward(adminUserId: string, userId: string, days: number): Promise<{ requests: number; bookings: number }> {
    const target = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, testAccountAt: true, professionalProfile: { select: { id: true } } },
    });
    if (!target) throw new NotFoundException("Utente non trovato.");
    if (!target.testAccountAt) throw new BadRequestException("Funziona solo sugli account di prova: segnalo prima come account di prova.");
    const ms = days * DAY_MS;
    const proId = target.professionalProfile?.id ?? null;

    const bookings = await this.prisma.booking.findMany({
      where: {
        OR: [{ clientId: userId }, ...(proId ? [{ professionalProfileId: proId }] : [])],
        client: TEST_USER,
        professionalProfile: { user: TEST_USER },
      },
      select: { ...selectOf(BOOKING_DATES), jobPayment: { select: selectOf(PAYMENT_DATES) }, issue: { select: selectOf(ISSUE_DATES) } },
    });
    if (process.env.STRIPE_SECRET_KEY?.startsWith("sk_live") && bookings.some((b) => b.jobPayment?.depositPaidAt)) {
      throw new BadRequestException("Con i pagamenti veri accesi non si sposta il tempo dei lavori pagati online.");
    }

    // Richieste del cliente di prova in cui anche tutti i professionisti
    // coinvolti (preventivi, inviti, professionista scelto) sono di prova.
    const requests = await this.prisma.guidedRequest.findMany({
      where: {
        client: TEST_USER,
        OR: [{ clientId: userId }, ...(proId ? [{ professionalProfileId: proId }, { quotes: { some: { professionalProfileId: proId } } }, { leads: { some: { professionalProfileId: proId } } }] : [])],
        quotes: { every: { professionalProfile: { user: TEST_USER } } },
        leads: { every: { professionalProfile: { user: TEST_USER } } },
        AND: [{ OR: [{ professionalProfileId: null }, { professionalProfile: { user: TEST_USER } }] }],
      },
      select: { ...selectOf(REQUEST_DATES), quotes: { select: selectOf(QUOTE_DATES) }, leads: { select: selectOf(LEAD_DATES) } },
    });

    await this.prisma.$transaction(async (tx) => {
      for (const request of requests) {
        await tx.guidedRequest.update({ where: { id: request.id }, data: shiftedDates(request, REQUEST_DATES, ms) });
        for (const quote of request.quotes) await tx.quote.update({ where: { id: quote.id }, data: shiftedDates(quote, QUOTE_DATES, ms) });
        for (const lead of request.leads) await tx.lead.update({ where: { id: lead.id }, data: shiftedDates(lead, LEAD_DATES, ms) });
      }
      for (const booking of bookings) {
        await tx.booking.update({ where: { id: booking.id }, data: shiftedDates(booking, BOOKING_DATES, ms) });
        if (booking.jobPayment) await tx.jobPayment.update({ where: { id: booking.jobPayment.id }, data: shiftedDates(booking.jobPayment, PAYMENT_DATES, ms) });
        if (booking.issue) await tx.jobIssue.update({ where: { id: booking.issue.id }, data: shiftedDates(booking.issue, ISSUE_DATES, ms) });
      }
    });

    await this.auditLogService.record({
      entityType: "User",
      entityId: userId,
      fieldName: "testTimeShift",
      oldValue: target.email ?? null,
      newValue: `${days}`,
      changedByUserId: adminUserId,
      reason: `Tempo spostato avanti di ${days} giorni per ${requests.length} richieste e ${bookings.length} lavori di prova`,
    });
    await this.runTimedChecks();
    return { requests: requests.length, bookings: bookings.length };
  }

  /** Gli stessi controlli che girano da soli ogni 5-60 minuti, subito. */
  private async runTimedChecks(): Promise<void> {
    const get = <T>(type: new (...args: never[]) => T): T => this.moduleRef.get(type, { strict: false });
    const checks: Array<[string, () => Promise<unknown>]> = [
      ["scadenze delle richieste", () => get(GuidedRequestsService).runExpiryCheck()],
      ["promemoria degli appuntamenti", () => get(BookingRemindersService).sendUpcomingReminders()],
      ["lavoro terminato da una parte sola", () => get(CompletionDeadlineService).run()],
      ["scadenze delle segnalazioni", () => get(JobIssueOutcomeService).runDeadlines()],
      ["sblocco dei soldi e bonifici", () => get(OnlineMoneyService).runReleases()],
    ];
    for (const [label, run] of checks) {
      try {
        await run();
      } catch (err) {
        this.logger.error(`Controllo "${label}" non riuscito dopo lo spostamento del tempo: ${(err as Error).message}`);
      }
    }
  }
}
