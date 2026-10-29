import { Inject, Injectable } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import type { PrismaClient } from "@professionisti/database";
import { wallClockNow } from "@professionisti/shared";
import { PRISMA } from "../prisma/prisma.module";
import { NotificationsService } from "../notifications/notifications.service";

/** Ore senza risposta prima del promemoria. */
export const DATE_CHANGE_REMINDER_HOURS = 12;

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
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
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
