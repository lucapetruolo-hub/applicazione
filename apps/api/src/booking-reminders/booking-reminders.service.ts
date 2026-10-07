import { Inject, Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import type { PrismaClient } from "@professionisti/database";
import { PRISMA } from "../prisma/prisma.module";
import { EmailService } from "../email/email.service";
import { bookingReminderClientEmail, bookingReminderProfessionalEmail } from "../email/templates/job-emails";
import { notificationChannelEnabled, resolveNotificationPreferences } from "@professionisti/shared";

function wantsReminderEmail(stored: unknown): boolean {
  return notificationChannelEnabled(resolveNotificationPreferences(stored), "BOOKING_REMINDER", "email");
}

// Finestra di invio: 23-25 ore prima dell'intervento. Il cron gira ogni 30
// minuti (sotto) — una finestra di 2 ore garantisce che ogni prenotazione
// venga vista almeno una volta, anche con un piccolo ritardo di esecuzione,
// senza doverla scandire ogni minuto.
const REMINDER_WINDOW_START_HOURS = 23;
const REMINDER_WINDOW_END_HOURS = 25;

/**
 * Promemoria automatico anti no-show (CLAUDE.md §1: "riduzione no-show" è
 * feature core del modello di business, non accessoria — CEO, tattico:
 * "prima di considerare l'MVP davvero completo"). Un'email al cliente e una
 * al professionista circa 24 ore prima di un intervento confermato
 * (`Booking.status === "CONFIRMED"`), inviate una sola volta per
 * prenotazione (`reminderSentAt`, vedi commento sul campo in schema.prisma).
 *
 * Stesso principio "mai crashare per una dipendenza non configurata" già
 * seguito per Stripe/Cloudinary/Google: senza `RESEND_API_KEY`,
 * `EmailService.send` logga e ritorna `false`, il cron continua a girare
 * normalmente (marca comunque `reminderSentAt` per non ritentare
 * all'infinito sulla stessa prenotazione — vedi sotto).
 */
@Injectable()
export class BookingRemindersService {
  private readonly logger = new Logger(BookingRemindersService.name);

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly emailService: EmailService,
  ) {}

  @Cron(CronExpression.EVERY_30_MINUTES)
  async sendUpcomingReminders(): Promise<void> {
    const now = new Date();
    const windowStart = new Date(now.getTime() + REMINDER_WINDOW_START_HOURS * 60 * 60 * 1000);
    const windowEnd = new Date(now.getTime() + REMINDER_WINDOW_END_HOURS * 60 * 60 * 1000);

    const bookings = await this.prisma.booking.findMany({
      where: { status: "CONFIRMED", reminderSentAt: null, scheduledAt: { gte: windowStart, lte: windowEnd } },
      include: {
        client: { select: { email: true, name: true, notificationPrefs: true } },
        professionalProfile: { select: { businessName: true, city: true, user: { select: { email: true, name: true, notificationPrefs: true } } } },
        quote: { select: { guidedRequest: { select: { city: true, category: { select: { label: true } } } } } },
      },
    });
    if (bookings.length === 0) return;

    for (const booking of bookings) {
      const professionalName = booking.professionalProfile.businessName;
      const category = booking.quote?.guidedRequest.category.label ?? null;

      // Solo a chi non ha spento le email di "Lavori e appuntamenti" (docs/CHANGELOG.md §152).
      if (booking.client.email && wantsReminderEmail(booking.client.notificationPrefs)) {
        await this.emailService.send({
          to: booking.client.email,
          ...bookingReminderClientEmail({ name: booking.client.name, businessName: professionalName, scheduledAt: booking.scheduledAt, category }),
        });
      }
      if (booking.professionalProfile.user.email && wantsReminderEmail(booking.professionalProfile.user.notificationPrefs)) {
        await this.emailService.send({
          to: booking.professionalProfile.user.email,
          ...bookingReminderProfessionalEmail({
            name: booking.professionalProfile.user.name,
            clientName: booking.client.name,
            scheduledAt: booking.scheduledAt,
            category,
            city: booking.city ?? booking.quote?.guidedRequest.city ?? null,
          }),
        });
      }

      // Marcato comunque (anche se l'email non è configurata o l'invio è
      // fallito): un solo tentativo per prenotazione, mai un retry
      // all'infinito ogni 30 minuti sulla stessa riga.
      await this.prisma.booking.update({ where: { id: booking.id }, data: { reminderSentAt: new Date() } });
    }
    this.logger.log(`Promemoria elaborati per ${bookings.length} prenotazioni.`);
  }
}
