import { Inject, Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import type { PrismaClient } from "@professionisti/database";
import { PRISMA } from "../prisma/prisma.module";
import { EmailService } from "../email/email.service";
import { bookingReminderClientEmail, bookingReminderProfessionalEmail } from "../email/templates/job-emails";
import { calendarIcs, googleCalendarUrl, type CalendarEvent } from "../email/email-calendar";
import { formatBookingAddress, notificationChannelEnabled, resolveNotificationPreferences } from "@professionisti/shared";

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
        quote: { select: { guidedRequest: { select: { city: true, address: true, description: true, category: { select: { label: true } } } } } },
      },
    });
    if (bookings.length === 0) return;

    for (const booking of bookings) {
      const professionalName = booking.professionalProfile.businessName;
      const category = booking.quote?.guidedRequest.category.label ?? null;
      const description = booking.quote?.guidedRequest.description ?? null;
      const professionalUser = booking.professionalProfile.user;
      const professionalFullName = [professionalUser.name, professionalUser.surname].filter(Boolean).join(" ") || null;

      // Dati del cliente per il professionista: il lavoro è confermato, quindi
      // sono già sbloccati (CLAUDE.md §5 punto 9). Stesso ordine dell'email
      // "preventivo accettato": prima i dati scritti all'accettazione, poi
      // quelli della richiesta, infine quelli dell'account (prenotazioni
      // dirette dall'agenda, docs/CHANGELOG.md §234).
      const client = booking.client;
      const clientName =
        [booking.recipientName, booking.recipientSurname].filter(Boolean).join(" ") || [client.name, client.surname].filter(Boolean).join(" ") || null;
      const requestAddress = booking.quote?.guidedRequest.address
        ? `${booking.quote.guidedRequest.address}${booking.quote.guidedRequest.city ? `, ${booking.quote.guidedRequest.city}` : ""}`
        : null;
      const address = formatBookingAddress(booking) ?? requestAddress ?? (client.deletedAt ? null : formatBookingAddress(client));
      const city = booking.city ?? booking.quote?.guidedRequest.city ?? null;

      // "Aggiungi al calendario" (docs/CHANGELOG.md §235): stesso evento per
      // entrambi, titolo diverso. Allegato .ics + link a Google Calendar.
      const calendarFor = (title: string, eventDescription: string): CalendarEvent => ({
        uid: `booking-${booking.id}@professionisti`,
        title,
        start: booking.scheduledAt,
        end: booking.scheduledEndAt,
        location: address ?? city,
        description: eventDescription,
      });
      const withCalendar = (event: CalendarEvent) => ({
        calendarUrl: googleCalendarUrl(event),
        attachment: { filename: "appuntamento.ics", content: calendarIcs(event), contentType: "text/calendar; charset=utf-8" },
      });
      const job = [category, description].filter(Boolean).join(": ");
      const clientCalendar = withCalendar(
        calendarFor(`${category ?? "Intervento"} con ${professionalFullName ?? professionalName}`, job),
      );
      const professionalCalendar = withCalendar(
        calendarFor(
          `${category ?? "Intervento"}${clientName ? ` da ${clientName}` : ""}`,
          [job, booking.recipientPhone ?? (client.deletedAt ? null : client.phone)].filter(Boolean).join("\n"),
        ),
      );

      // Solo a chi non ha spento le email di "Lavori e appuntamenti" (docs/CHANGELOG.md §152).
      if (booking.client.email && wantsReminderEmail(booking.client.notificationPrefs)) {
        await this.emailService.send({
          to: booking.client.email,
          attachments: [clientCalendar.attachment],
          ...bookingReminderClientEmail({
            name: booking.client.name,
            businessName: professionalName,
            professionalFullName,
            scheduledAt: booking.scheduledAt,
            scheduledEndAt: booking.scheduledEndAt,
            address,
            city,
            category,
            description,
            calendarUrl: clientCalendar.calendarUrl,
          }),
        });
      }
      if (booking.professionalProfile.user.email && wantsReminderEmail(booking.professionalProfile.user.notificationPrefs)) {
        await this.emailService.send({
          to: booking.professionalProfile.user.email,
          attachments: [professionalCalendar.attachment],
          ...bookingReminderProfessionalEmail({
            name: booking.professionalProfile.user.name,
            clientName,
            clientPhone: booking.recipientPhone ?? (client.deletedAt ? null : client.phone),
            // Mai l'email anonimizzata di un account cancellato.
            clientEmail: client.deletedAt ? null : client.email,
            address,
            scheduledAt: booking.scheduledAt,
            scheduledEndAt: booking.scheduledEndAt,
            category,
            city,
            description,
            calendarUrl: professionalCalendar.calendarUrl,
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
