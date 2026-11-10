import { BadRequestException, ForbiddenException, Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { CronExpression } from "@nestjs/schedule";
import type { PrismaClient } from "@professionisti/database";
import {
  RECURRING_FREQUENCY_LABELS,
  isRecurringFrequency,
  quotePriceTotals,
  recurringVisitDate,
  recurringVisitsToCreate,
  wallClockNow,
  type JobPaymentChoice,
  type RecurringFrequency,
  type RecurringVisitInfo,
} from "@professionisti/shared";
import { PRISMA } from "../prisma/prisma.module";
import { ScheduledJob } from "../common/scheduled-job";
import { capacityAt, countOverlapping, loadCommitments, lockProfessionalAgenda } from "../agenda/commitments";
import { NotificationsService } from "../notifications/notifications.service";
import { TimelineService } from "../timeline/timeline.service";
import { JobPaymentsService } from "../job-payments/job-payments.service";

/** Nota sulle visite tolte da "Interrompi": la leggono tutti e due nella scheda. */
export const RECURRING_STOPPED_NOTE = "Lavoro ricorrente interrotto.";
/** Visita saltata da sola: a quell'ora il professionista aveva già un altro lavoro. */
export const RECURRING_BUSY_NOTE = "Questa volta salta: a quell'ora il professionista ha già un altro lavoro.";

/**
 * Lavori ricorrenti (funzione nuova 3 del controllo pre-lancio dell'08/11,
 * docs/changelog/2026-11-09-lavori-ricorrenti.md). Accettando un preventivo
 * con `repeatEvery` nasce la serie; ogni visita è un lavoro (Booking) con i
 * suoi promemoria, "Lavoro terminato" e pagamento, messo in agenda per i 28
 * giorni dopo. Pagamento come la prima visita (decisione di Luca del 09/11):
 * online con la carta salvata all'acconto, addebitata a lavoro terminato,
 * oppure diretto. "Salta questa volta" è il normale annullamento di una
 * visita; "Interrompi" ferma la serie.
 */
@Injectable()
export class RecurringJobsService {
  private readonly logger = new Logger(RecurringJobsService.name);

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly notificationsService: NotificationsService,
    private readonly timelineService: TimelineService,
    private readonly jobPaymentsService: JobPaymentsService,
  ) {}

  /** Dopo l'accettazione: la prima visita diventa la n. 1 della serie e le prossime entrano in agenda. */
  async startFromAcceptedQuote(params: { quoteId: string; bookingId: string; paymentChoice: JobPaymentChoice }): Promise<void> {
    const quote = await this.prisma.quote.findUnique({ where: { id: params.quoteId }, select: { repeatEvery: true } });
    if (!quote || !isRecurringFrequency(quote.repeatEvery)) return;
    const booking = await this.prisma.booking.findUniqueOrThrow({
      where: { id: params.bookingId },
      select: { clientId: true, professionalProfileId: true, scheduledAt: true, scheduledEndAt: true },
    });
    const series = await this.prisma.recurringJob.create({
      data: {
        quoteId: params.quoteId,
        clientId: booking.clientId,
        professionalProfileId: booking.professionalProfileId,
        frequency: quote.repeatEvery,
        firstAt: booking.scheduledAt,
        firstEndAt: booking.scheduledEndAt,
        paymentChoice: params.paymentChoice,
      },
    });
    await this.prisma.booking.update({ where: { id: params.bookingId }, data: { recurringJobId: series.id, recurringNumber: 1 } });
    try {
      await this.extend(series.id);
    } catch (err) {
      // Le visite dopo le rimette il giro di ogni ora: l'accettazione resta valida.
      this.logger.error(`Visite del lavoro ricorrente ${series.id} non create subito`, err as Error);
    }
  }

  // Ogni ora: le visite dei prossimi 28 giorni (CLAUDE.md, attività a orario).
  @ScheduledJob(CronExpression.EVERY_HOUR)
  async extendAll(): Promise<number> {
    const series = await this.prisma.recurringJob.findMany({ where: { stoppedAt: null }, select: { id: true }, take: 2000 });
    let created = 0;
    for (const { id } of series) {
      try {
        created += await this.extend(id);
      } catch (err) {
        this.logger.error(`Visite del lavoro ricorrente ${id} non create`, err as Error);
      }
    }
    return created;
  }

  /** Crea le visite che mancano nei prossimi 28 giorni. Restituisce quante. */
  async extend(seriesId: string, now: Date = wallClockNow()): Promise<number> {
    const series = await this.prisma.recurringJob.findUnique({
      where: { id: seriesId },
      include: {
        quote: { select: { guidedRequestId: true, items: { select: { priceMaxEurCents: true, priceMinEurCents: true } } } },
        bookings: { where: { recurringNumber: 1 }, take: 1 },
      },
    });
    if (!series || series.stoppedAt || !isRecurringFrequency(series.frequency)) return 0;
    const first = series.bookings[0];
    if (!first) return 0;
    const frequency: RecurringFrequency = series.frequency;
    const numbers = recurringVisitsToCreate(series.firstAt, frequency, series.lastNumber, now);
    const durationMs = series.firstEndAt ? series.firstEndAt.getTime() - series.firstAt.getTime() : null;
    const quoteMaxEurCents = quotePriceTotals(series.quote.items).totalMaxEurCents;
    let created = 0;
    for (const number of numbers) {
      const start = recurringVisitDate(series.firstAt, frequency, number);
      const end = durationMs !== null ? new Date(start.getTime() + durationMs) : null;
      const visit = await this.prisma.$transaction(async (tx) => {
        await lockProfessionalAgenda(tx, series.professionalProfileId);
        // Un altro giro ha già creato questa visita.
        const fresh = await tx.recurringJob.findUniqueOrThrow({ where: { id: series.id }, select: { lastNumber: true, stoppedAt: true } });
        if (fresh.stoppedAt || fresh.lastNumber >= number) return null;
        const dayStart = new Date(start);
        dayStart.setUTCHours(0, 0, 0, 0);
        const until = end && end > start ? end : new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
        const commitments = (await loadCommitments(tx, [series.professionalProfileId], dayStart, until)).get(series.professionalProfileId) ?? [];
        const busy = countOverlapping(commitments, start, end, first.serviceMode) >= (await capacityAt(tx, series.professionalProfileId, start, first.serviceMode));
        const booking = await tx.booking.create({
          data: {
            clientId: series.clientId,
            professionalProfileId: series.professionalProfileId,
            scheduledAt: start,
            scheduledEndAt: end,
            cancellationNoticeHours: first.cancellationNoticeHours,
            serviceMode: first.serviceMode,
            // Ora già occupata (per esempio un lavoro preso prima che la visita entrasse in agenda): salta da sola e lo sanno tutti e due.
            status: busy ? "CANCELED" : "CONFIRMED",
            ...(busy ? { canceledBy: "PROFESSIONAL" as const, skippedAt: new Date(), cancellationNote: RECURRING_BUSY_NOTE } : {}),
            recurringJobId: series.id,
            recurringNumber: number,
            recipientName: first.recipientName,
            recipientSurname: first.recipientSurname,
            recipientPhone: first.recipientPhone,
            street: first.street,
            houseNumber: first.houseNumber,
            addressExtra: first.addressExtra,
            postalCode: first.postalCode,
            city: first.city,
            province: first.province,
          },
        });
        await tx.recurringJob.update({ where: { id: series.id }, data: { lastNumber: number } });
        return { booking, busy };
      });
      if (!visit) continue;
      created++;
      if (visit.busy) {
        await this.notifyBusySkip(series, visit.booking.id, start);
        continue;
      }
      // Stesso modo di pagamento della prima visita (decisione di Luca del 09/11):
      // online senza acconto, tutto a lavoro terminato con la carta salvata.
      await this.jobPaymentsService.createForRecurringVisit({
        bookingId: visit.booking.id,
        choice: series.paymentChoice as JobPaymentChoice,
        quoteMaxEurCents,
        clientUserId: series.clientId,
      });
    }
    return created;
  }

  private async notifyBusySkip(series: { id: string; clientId: string; professionalProfileId: string; quote: { guidedRequestId: string } }, bookingId: string, start: Date): Promise<void> {
    const professional = await this.prisma.professionalProfile.findUnique({ where: { id: series.professionalProfileId }, select: { userId: true } });
    const payload = { bookingId, guidedRequestId: series.quote.guidedRequestId, scheduledAt: start.toISOString(), reason: "busy" };
    await this.notificationsService.notify(series.clientId, "RECURRING_VISIT_SKIPPED", { ...payload, audience: "CLIENT" });
    if (professional) await this.notificationsService.notify(professional.userId, "RECURRING_VISIT_SKIPPED", { ...payload, audience: "PROFESSIONAL" });
  }

  /**
   * "Interrompi": niente più visite. Quelle già in agenda e non ancora
   * cominciate si annullano (senza soldi in gioco: si paga a visita
   * terminata); quelle fatte restano. Lo può fare cliente o professionista.
   */
  async stop(userId: string, seriesId: string): Promise<{ stoppedAt: string; canceledVisits: number }> {
    const series = await this.prisma.recurringJob.findUnique({
      where: { id: seriesId },
      include: { quote: { select: { guidedRequestId: true } } },
    });
    if (!series) throw new NotFoundException("Lavoro ricorrente non trovato.");
    const professional = await this.prisma.professionalProfile.findUnique({ where: { id: series.professionalProfileId }, select: { userId: true } });
    const by = series.clientId === userId ? "CLIENT" : professional?.userId === userId ? "PROFESSIONAL" : null;
    if (!by) throw new ForbiddenException("Questo lavoro ricorrente non è tuo.");
    if (series.stoppedAt) throw new BadRequestException("Questo lavoro ricorrente è già interrotto.");
    const result = await this.stopSeries(series.id, by);
    const otherUserId = by === "CLIENT" ? professional?.userId : series.clientId;
    if (otherUserId) {
      await this.notificationsService.notify(otherUserId, "RECURRING_JOB_STOPPED", {
        guidedRequestId: series.quote.guidedRequestId,
        stoppedBy: by,
        canceledVisits: result.canceledVisits,
        audience: by === "CLIENT" ? "PROFESSIONAL" : "CLIENT",
      });
    }
    await this.timelineService.log(
      series.quote.guidedRequestId,
      series.professionalProfileId,
      by,
      `${by === "CLIENT" ? "Il cliente" : "Il professionista"} ha interrotto il lavoro ricorrente: niente più visite${result.canceledVisits > 0 ? ` (${result.canceledVisits} ${result.canceledVisits === 1 ? "tolta" : "tolte"} dall'agenda)` : ""}.`,
    );
    return { stoppedAt: result.stoppedAt.toISOString(), canceledVisits: result.canceledVisits };
  }

  /** Ferma la serie e annulla le visite future; usata anche alla chiusura di un account. */
  async stopSeries(seriesId: string, by: "CLIENT" | "PROFESSIONAL" | "SYSTEM"): Promise<{ stoppedAt: Date; canceledVisits: number }> {
    const stoppedAt = new Date();
    const claimed = await this.prisma.recurringJob.updateMany({ where: { id: seriesId, stoppedAt: null }, data: { stoppedAt, stoppedBy: by } });
    if (claimed.count === 0) return { stoppedAt, canceledVisits: 0 };
    // Solo visite senza soldi già presi: la prima, con l'acconto online, segue il normale annullamento.
    const canceled = await this.prisma.booking.updateMany({
      where: {
        recurringJobId: seriesId,
        recurringNumber: { gt: 1 },
        status: { in: ["PENDING", "CONFIRMED"] },
        scheduledAt: { gt: wallClockNow() },
        professionalCompletedAt: null,
      },
      data: { status: "CANCELED", canceledBy: by === "CLIENT" ? "CLIENT" : "PROFESSIONAL", cancellationNote: RECURRING_STOPPED_NOTE },
    });
    return { stoppedAt, canceledVisits: canceled.count };
  }

  /** Alla chiusura di un account (cliente o professionista) le sue serie si fermano. */
  async stopAllFor(where: { clientId: string } | { professionalProfileId: string }): Promise<void> {
    const series = await this.prisma.recurringJob.findMany({ where: { ...where, stoppedAt: null }, select: { id: true } });
    for (const { id } of series) await this.stopSeries(id, "SYSTEM");
  }
}

/** Testo breve per schede e notifiche: "Ogni settimana". */
export function recurringLabel(frequency: string | null | undefined): string | null {
  return isRecurringFrequency(frequency) ? RECURRING_FREQUENCY_LABELS[frequency] : null;
}

/** Dati della serie per le schede (ClientBooking/ProfessionalBooking.recurring), null per un lavoro di una volta. */
export function recurringVisitInfo(booking: {
  recurringNumber: number | null;
  skippedAt: Date | null;
  recurringJob: { id: string; frequency: string; stoppedAt: Date | null; stoppedBy: string | null; paymentChoice: string } | null;
}): RecurringVisitInfo | null {
  const series = booking.recurringJob;
  if (!series || !isRecurringFrequency(series.frequency)) return null;
  return {
    seriesId: series.id,
    frequency: series.frequency,
    number: booking.recurringNumber ?? 1,
    skippedAt: booking.skippedAt?.toISOString() ?? null,
    stoppedAt: series.stoppedAt?.toISOString() ?? null,
    stoppedBy: series.stoppedBy === "CLIENT" || series.stoppedBy === "PROFESSIONAL" ? series.stoppedBy : series.stoppedBy ? "SYSTEM" : null,
    paysOnline: series.paymentChoice === "ONLINE",
  };
}
