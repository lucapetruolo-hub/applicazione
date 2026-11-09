import { Inject, Injectable, Logger } from "@nestjs/common";
import type { PrismaClient } from "@professionisti/database";
import { PRISMA } from "../prisma/prisma.module";
import { NotificationsService } from "../notifications/notifications.service";
import { ScheduledJob } from "../common/scheduled-job";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Giorni dopo la conferma del cliente in cui parte il promemoria. */
export const REVIEW_REMINDER_AFTER_DAYS = 3;
/** Oltre questi giorni non si scrive più: un lavoro vecchio non si ricorda. */
export const REVIEW_REMINDER_MAX_DAYS = 14;

/**
 * Un solo promemoria della recensione (docs/changelog/2026-11-09-passaparola.md,
 * skill referrals): a chi ha confermato da sé il lavoro terminato e non ha
 * recensito, 3 giorni dopo, una volta. Uguale per tutti, senza guardare voti,
 * chat o pagamenti: niente richieste "solo ai contenti" (regole di Google) e
 * niente premi. Esclusi: chi ha una segnalazione aperta, i lavori chiusi
 * d'ufficio (hanno già avuto due promemoria e l'email di chiusura con la
 * recensione) e i profili o gli account eliminati.
 */
@Injectable()
export class ReviewReminderService {
  private readonly logger = new Logger(ReviewReminderService.name);

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly notificationsService: NotificationsService,
  ) {}

  @ScheduledJob("0 0 11 * * *")
  async run(now: Date = new Date()): Promise<number> {
    const bookings = await this.prisma.booking.findMany({
      where: {
        status: { in: ["COMPLETED", "CONFIRMED"] },
        clientConfirmedCompletedAt: { lte: new Date(now.getTime() - REVIEW_REMINDER_AFTER_DAYS * DAY_MS), gte: new Date(now.getTime() - REVIEW_REMINDER_MAX_DAYS * DAY_MS) },
        completionAutoClosedAt: null,
        reviewReminderSentAt: null,
        review: { is: null },
        OR: [{ issue: { is: null } }, { issue: { is: { status: { notIn: ["OPEN", "CHAT"] } } } }],
        client: { deletedAt: null },
        professionalProfile: { deletedAt: null },
      },
      select: { id: true, clientId: true, quote: { select: { guidedRequestId: true } } },
      take: 500,
    });
    let sent = 0;
    for (const booking of bookings) {
      // Segnato prima di inviare: con due giri insieme parte una volta sola.
      const { count } = await this.prisma.booking.updateMany({ where: { id: booking.id, reviewReminderSentAt: null }, data: { reviewReminderSentAt: now } });
      if (count === 0) continue;
      try {
        await this.notificationsService.notify(booking.clientId, "REVIEW_REMINDER", { bookingId: booking.id, guidedRequestId: booking.quote?.guidedRequestId ?? null });
        sent += 1;
      } catch (error) {
        this.logger.error(`Promemoria della recensione non inviato per ${booking.id}`, error as Error);
      }
    }
    return sent;
  }
}
