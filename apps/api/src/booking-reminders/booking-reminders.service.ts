import { Inject, Injectable, Logger, Optional } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import type { PrismaClient } from "@professionisti/database";
import { PRISMA } from "../prisma/prisma.module";
import { EmailService } from "../email/email.service";
import { WhatsAppService } from "../whatsapp/whatsapp.service";
import { bookingReminderClientEmail, bookingReminderProfessionalEmail } from "../email/templates/job-emails";
import { bookingCalendar, bookingPeople } from "../email/booking-calendar";
import { notificationChannelEnabled, resolveNotificationPreferences, wallClockNow } from "@professionisti/shared";
import { frontendUrl } from "../email/email-brand";
import { depositReminderTimes } from "../whatsapp/whatsapp-rules";
import { bookingReplyToken } from "./booking-reply-token";
import { depositDeadline } from "./deposit-deadline";

function wantsReminderEmail(stored: unknown): boolean {
  return notificationChannelEnabled(resolveNotificationPreferences(stored), "BOOKING_REMINDER", "email");
}

// Finestra di invio: 23-25 ore prima dell'intervento. Il cron gira ogni 30
// minuti (sotto) — una finestra di 2 ore garantisce che ogni prenotazione
// venga vista almeno una volta, anche con un piccolo ritardo di esecuzione,
// senza doverla scandire ogni minuto.
const REMINDER_WINDOW_START_HOURS = 23;
const REMINDER_WINDOW_END_HOURS = 25;
// Con l'email dell'acconto partita da poco (preavviso di 24 ore) quella del
// giorno prima non riparte: stessa regola del promemoria WhatsApp.
const RECENT_DEPOSIT_REMINDER_MS = 18 * 60 * 60 * 1000;

/** Pagina dei pulsanti "Ci sarò" e "Non posso più" dell'email (link firmato). */
function replyUrl(bookingId: string): string {
  return `${frontendUrl()}/promemoria/${bookingReplyToken(bookingId)}`;
}

const REMINDER_INCLUDE = {
  client: {
    select: {
      email: true,
      name: true,
      surname: true,
      phone: true,
      deletedAt: true,
      notificationPrefs: true,
      street: true,
      houseNumber: true,
      addressExtra: true,
      postalCode: true,
      city: true,
      province: true,
    },
  },
  professionalProfile: { select: { businessName: true, city: true, user: { select: { email: true, name: true, surname: true, notificationPrefs: true } } } },
  quote: {
    select: {
      guidedRequestId: true,
      lateCancelKeepsDeposit: true,
      guidedRequest: { select: { city: true, address: true, description: true, category: { select: { label: true } } } },
    },
  },
  jobPayment: { select: { paymentMethod: true, paidEurCents: true, refundedEurCents: true, depositKeptAt: true } },
} as const;

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
    // Facoltativo solo per i test che costruiscono il servizio a mano.
    @Optional() private readonly whatsAppService?: WhatsAppService,
  ) {}

  @Cron(CronExpression.EVERY_30_MINUTES)
  async sendUpcomingReminders(): Promise<void> {
    // scheduledAt è l'ora italiana scritta in UTC: si confronta con l'ora italiana di adesso (docs/CHANGELOG.md §287).
    const now = wallClockNow();
    const windowStart = new Date(now.getTime() + REMINDER_WINDOW_START_HOURS * 60 * 60 * 1000);
    const windowEnd = new Date(now.getTime() + REMINDER_WINDOW_END_HOURS * 60 * 60 * 1000);

    const bookings = await this.prisma.booking.findMany({
      where: { status: "CONFIRMED", reminderSentAt: null, scheduledAt: { gte: windowStart, lte: windowEnd } },
      include: REMINDER_INCLUDE,
    });
    if (bookings.length === 0) return;

    for (const booking of bookings) {
      // Nome, contatti e luogo (docs/CHANGELOG.md §234) e calendario (§235).
      const people = bookingPeople(booking);
      const clientCalendar = bookingCalendar(booking, "client");
      const professionalCalendar = bookingCalendar(booking, "professional");
      const depositEmailRecent =
        booking.clientDepositReminderAt !== null && Date.now() - booking.clientDepositReminderAt.getTime() < RECENT_DEPOSIT_REMINDER_MS;

      // Solo a chi non ha spento le email di "Lavori e appuntamenti" (docs/CHANGELOG.md §152).
      if (booking.client.email && wantsReminderEmail(booking.client.notificationPrefs) && !depositEmailRecent) {
        await this.emailService.send({
          to: booking.client.email,
          attachments: [clientCalendar.attachment],
          ...bookingReminderClientEmail({
            name: booking.client.name,
            businessName: people.businessName,
            professionalFullName: people.professionalFullName,
            scheduledAt: booking.scheduledAt,
            scheduledEndAt: booking.scheduledEndAt,
            address: people.address,
            city: people.city,
            category: people.category,
            description: people.description,
            calendarUrl: clientCalendar.calendarUrl,
            replyUrl: replyUrl(booking.id),
            depositDeadline: depositDeadline(booking, new Date()),
          }),
        });
      }
      if (booking.professionalProfile.user.email && wantsReminderEmail(booking.professionalProfile.user.notificationPrefs)) {
        await this.emailService.send({
          to: booking.professionalProfile.user.email,
          attachments: [professionalCalendar.attachment],
          ...bookingReminderProfessionalEmail({
            name: booking.professionalProfile.user.name,
            clientName: people.clientName,
            clientPhone: people.clientPhone,
            clientEmail: people.clientEmail,
            address: people.address,
            scheduledAt: booking.scheduledAt,
            scheduledEndAt: booking.scheduledEndAt,
            category: people.category,
            city: people.city,
            description: people.description,
            calendarUrl: professionalCalendar.calendarUrl,
          }),
        });
      }

      // Promemoria su WhatsApp al cliente che l'ha acceso (anti no-show,
      // docs/changelog/2026-10-28-promemoria-whatsapp.md): mai bloccante. Il
      // professionista riceve il riepilogo della sera prima.
      if (this.whatsAppService && !booking.client.deletedAt) {
        try {
          await this.whatsAppService.bookingReminder({
            bookingId: booking.id,
            scheduledAt: booking.scheduledAt,
            clientId: booking.clientId,
            businessName: booking.professionalProfile.businessName,
            guidedRequestId: booking.quote?.guidedRequestId ?? null,
          });
        } catch (error) {
          this.logger.error(`Promemoria WhatsApp non messo in coda: ${error instanceof Error ? error.message : String(error)}`);
        }
      }

      // Marcato comunque (anche se l'email non è configurata o l'invio è
      // fallito): un solo tentativo per prenotazione, mai un retry
      // all'infinito ogni 30 minuti sulla stessa riga.
      await this.prisma.booking.update({ where: { id: booking.id }, data: { reminderSentAt: new Date() } });
    }
    this.logger.log(`Promemoria elaborati per ${bookings.length} prenotazioni.`);
  }

  /**
   * Con un acconto che resta al professionista se si annulla tardi, l'email
   * al cliente parte prima che inizi il preavviso, con la scadenza per
   * annullare e riaverlo (Luca, 29/10/2026): stessi orari del promemoria
   * WhatsApp (`depositReminderTimes`), una volta sola per appuntamento.
   */
  @Cron(CronExpression.EVERY_30_MINUTES)
  async sendDepositReminders(now: Date = new Date()): Promise<number> {
    const wall = wallClockNow(now);
    const bookings = await this.prisma.booking.findMany({
      where: {
        status: "CONFIRMED",
        clientDepositReminderAt: null,
        scheduledAt: { gt: wall, lte: new Date(wall.getTime() + 4 * 24 * 60 * 60 * 1000) },
        quote: { lateCancelKeepsDeposit: true },
        jobPayment: { paymentMethod: "MANOVIA", depositPaidAt: { not: null }, depositKeptAt: null, releasedAt: null },
      },
      include: REMINDER_INCLUDE,
    });
    let sent = 0;
    for (const booking of bookings) {
      const deadline = depositDeadline(booking, now);
      if (!deadline) continue;
      const { sendFrom } = depositReminderTimes(booking.scheduledAt, booking.cancellationNoticeHours ?? 24);
      // Troppo vicino alla fine del preavviso: vale l'email del giorno prima.
      if (wall.getTime() < sendFrom.getTime() || wall.getTime() >= deadline.getTime() - 60 * 60 * 1000) continue;
      // Segnata prima di mandare: un solo tentativo, mai un doppione.
      const claimed = await this.prisma.booking.updateMany({ where: { id: booking.id, clientDepositReminderAt: null }, data: { clientDepositReminderAt: now } });
      if (claimed.count === 0) continue;
      if (!booking.client.email || booking.client.deletedAt || !wantsReminderEmail(booking.client.notificationPrefs)) continue;
      const people = bookingPeople(booking);
      const calendar = bookingCalendar(booking, "client");
      await this.emailService.send({
        to: booking.client.email,
        attachments: [calendar.attachment],
        ...bookingReminderClientEmail({
          name: booking.client.name,
          businessName: people.businessName,
          professionalFullName: people.professionalFullName,
          scheduledAt: booking.scheduledAt,
          scheduledEndAt: booking.scheduledEndAt,
          address: people.address,
          city: people.city,
          category: people.category,
          description: people.description,
          calendarUrl: calendar.calendarUrl,
          replyUrl: replyUrl(booking.id),
          depositDeadline: deadline,
          deposit: true,
        }),
      });
      sent++;
    }
    return sent;
  }
}
