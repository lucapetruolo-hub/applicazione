import { Inject, Injectable } from "@nestjs/common";
import { CronExpression } from "@nestjs/schedule";
import type { PrismaClient } from "@professionisti/database";
import { wallClockNow } from "@professionisti/shared";
import { PRISMA } from "../prisma/prisma.module";
import { NotificationsService } from "../notifications/notifications.service";
import { ScheduledJob } from "../common/scheduled-job";
import { TimelineService } from "../timeline/timeline.service";
import { proposedByProfessionalFirst } from "../quotes/booked-date-change";

/** Ore senza risposta prima del promemoria. */
export const DATE_CHANGE_REMINDER_HOURS = 12;
/** Ore prima dell'appuntamento per l'ultimo avviso a tutti e due. */
export const DATE_CHANGE_LAST_CALL_HOURS = 3;
/** Alle 20 si avvisa già per gli appuntamenti del mattino dopo fino alle 11. */
const EVENING_HOUR = 20;
const MORNING_LIMIT_HOUR = 11;
const HOUR_MS = 60 * 60 * 1000;

/**
 * Fin dove arriva oggi l'ultimo avviso (ora italiana come UTC): le prossime 3
 * ore e, alle 20, anche il mattino dopo fino alle 11, perché di notte non si
 * scrive e alle 8 sarebbe tardi (docs/changelog/2026-11-18-sposta-e-terminato-in-anticipo.md).
 */
export function lastCallHorizon(wall: Date): Date {
  const soon = new Date(wall.getTime() + DATE_CHANGE_LAST_CALL_HOURS * HOUR_MS);
  if (wall.getUTCHours() < EVENING_HOUR) return soon;
  const morning = new Date(Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth(), wall.getUTCDate() + 1, MORNING_LIMIT_HOUR));
  return morning > soon ? morning : soon;
}

/**
 * Altra data proposta per un appuntamento già fissato e ancora senza
 * risposta dopo 12 ore (Luca, 29/10/2026,
 * docs/changelog/2026-10-28-promemoria-whatsapp.md): un promemoria, uno
 * solo, a chi deve rispondere. Mai di notte (21-8).
 */
@Injectable()
export class DateChangeRemindersService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly notificationsService: NotificationsService,
    private readonly timelineService: TimelineService,
  ) {}

  /**
   * Proposta ancora senza risposta a poche ore dall'appuntamento
   * (docs/changelog/2026-11-18-sposta-e-terminato-in-anticipo.md): un avviso
   * a tutti e due che vale l'orario di adesso, così nessuno si presenta per
   * niente. Passato l'orario la proposta scade da sola.
   */
  @ScheduledJob(CronExpression.EVERY_HOUR)
  async lastCallAndExpire(now: Date = new Date()): Promise<{ warned: number; expired: number }> {
    const expired = await this.expirePast(now);
    const wall = wallClockNow(now);
    const hour = wall.getUTCHours();
    if (hour < 8 || hour >= 21) return { warned: 0, expired };
    const bookings = await this.prisma.booking.findMany({
      where: {
        status: "CONFIRMED",
        scheduledAt: { gt: wall, lte: lastCallHorizon(wall) },
        rescheduleRequestedAt: { not: null },
        rescheduleLastCallAt: null,
        quote: { status: "ACCEPTED", clientProposedDate: { not: null } },
      },
      select: {
        id: true,
        clientId: true,
        scheduledAt: true,
        scheduledEndAt: true,
        rescheduleProposedBy: true,
        rescheduleRequestedAt: true,
        clientCantComeAt: true,
        professionalProfile: { select: { userId: true } },
        quote: { select: { id: true, guidedRequestId: true, clientProposedDate: true, clientProposedEndDate: true } },
      },
    });
    let warned = 0;
    for (const booking of bookings) {
      const quote = booking.quote;
      if (!quote?.clientProposedDate) continue;
      const claimed = await this.prisma.booking.updateMany({
        where: { id: booking.id, rescheduleLastCallAt: null, rescheduleRequestedAt: { not: null } },
        // Anche il promemoria delle 12 ore non serve più.
        data: { rescheduleLastCallAt: now, rescheduleReminderAt: now },
      });
      if (claimed.count === 0) continue;
      const proposedBy = booking.rescheduleProposedBy === "PROFESSIONAL" ? "PROFESSIONAL" : "CLIENT";
      const base = {
        guidedRequestId: quote.guidedRequestId,
        quoteId: quote.id,
        bookingId: booking.id,
        proposedBy,
        from: { start: booking.scheduledAt.toISOString(), end: booking.scheduledEndAt?.toISOString() ?? null },
        to: { start: quote.clientProposedDate.toISOString(), end: quote.clientProposedEndDate?.toISOString() ?? null },
      };
      await this.notificationsService.notify(booking.clientId, "BOOKING_DATE_CHANGE_UNANSWERED", {
        ...base,
        audience: "client",
        ...(proposedByProfessionalFirst(booking) ? { clientCancelsFree: true } : {}),
      });
      await this.notificationsService.notify(booking.professionalProfile.userId, "BOOKING_DATE_CHANGE_UNANSWERED", { ...base, audience: "professional" });
      warned++;
    }
    return { warned, expired };
  }

  /** Orario dell'appuntamento passato con la proposta ancora in sospeso: la proposta si toglie, vale com'era. */
  private async expirePast(now: Date): Promise<number> {
    const wall = wallClockNow(now);
    const bookings = await this.prisma.booking.findMany({
      where: { rescheduleRequestedAt: { not: null }, scheduledAt: { lte: wall } },
      select: { id: true, professionalProfileId: true, quote: { select: { id: true, guidedRequestId: true } } },
    });
    let expired = 0;
    for (const booking of bookings) {
      const cleared = await this.prisma.booking.updateMany({
        where: { id: booking.id, rescheduleRequestedAt: { not: null }, scheduledAt: { lte: wall } },
        data: { rescheduleRequestedAt: null, rescheduleProposedBy: null, rescheduleReminderAt: null, rescheduleLastCallAt: null, rescheduleRounds: 0 },
      });
      if (cleared.count === 0) continue;
      if (booking.quote) {
        await this.prisma.quote.update({
          where: { id: booking.quote.id },
          data: { clientProposedDate: null, clientProposedEndDate: null, clientProposedNote: null, professionalCounterNote: null, proposedDateAcceptedAt: null },
        });
        await this.timelineService.log(
          booking.quote.guidedRequestId,
          booking.professionalProfileId,
          "SYSTEM",
          "L'altra data proposta non ha avuto risposta prima dell'appuntamento: la proposta è scaduta e vale l'orario di prima.",
        );
      }
      expired++;
    }
    return expired;
  }

  @ScheduledJob(CronExpression.EVERY_HOUR)
  async remindUnanswered(now: Date = new Date()): Promise<number> {
    const wall = wallClockNow(now);
    const hour = wall.getUTCHours();
    if (hour < 8 || hour >= 21) return 0;
    const bookings = await this.prisma.booking.findMany({
      where: {
        status: "CONFIRMED",
        scheduledAt: { gt: wall },
        rescheduleRequestedAt: {
          not: null,
          lte: new Date(
            now.getTime() - DATE_CHANGE_REMINDER_HOURS * 60 * 60 * 1000,
          ),
        },
        rescheduleReminderAt: null,
        quote: { status: "ACCEPTED", clientProposedDate: { not: null } },
      },
      select: {
        id: true,
        clientId: true,
        scheduledAt: true,
        scheduledEndAt: true,
        rescheduleProposedBy: true,
        professionalProfileId: true,
        professionalProfile: { select: { userId: true } },
        quote: {
          select: {
            id: true,
            guidedRequestId: true,
            clientProposedDate: true,
            clientProposedEndDate: true,
          },
        },
      },
    });
    let sent = 0;
    for (const booking of bookings) {
      const quote = booking.quote;
      if (!quote?.clientProposedDate) continue;
      // Segnato prima di mandare: un solo promemoria per proposta.
      const claimed = await this.prisma.booking.updateMany({
        where: {
          id: booking.id,
          rescheduleReminderAt: null,
          rescheduleRequestedAt: { not: null },
        },
        data: { rescheduleReminderAt: now },
      });
      if (claimed.count === 0) continue;
      const byProfessional = booking.rescheduleProposedBy === "PROFESSIONAL";
      await this.notificationsService.notify(
        byProfessional ? booking.clientId : booking.professionalProfile.userId,
        byProfessional ? "QUOTE_DATE_CHANGED" : "QUOTE_DATE_PROPOSED",
        {
          guidedRequestId: quote.guidedRequestId,
          quoteId: quote.id,
          bookingId: booking.id,
          booked: true,
          reminder: true,
          from: {
            start: booking.scheduledAt.toISOString(),
            end: booking.scheduledEndAt?.toISOString() ?? null,
          },
          to: {
            start: quote.clientProposedDate.toISOString(),
            end: quote.clientProposedEndDate?.toISOString() ?? null,
          },
        },
      );
      sent++;
    }
    return sent;
  }
}
