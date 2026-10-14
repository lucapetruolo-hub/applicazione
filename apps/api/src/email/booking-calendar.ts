import { formatBookingAddress } from "@professionisti/shared";
import { calendarIcs, googleCalendarUrl, type CalendarEvent } from "./email-calendar";
import type { EmailContent } from "./email-layout";

/**
 * Dati di una prenotazione per le email con il calendario (docs/CHANGELOG.md
 * §234-§235): promemoria, preventivo accettato, prenotazione annullata o
 * riaperta. Un solo posto che decide nome, contatti e luogo, così ogni email
 * mostra le stesse cose.
 */
export const BOOKING_CALENDAR_INCLUDE = {
  client: {
    select: {
      name: true,
      surname: true,
      phone: true,
      email: true,
      deletedAt: true,
      street: true,
      houseNumber: true,
      addressExtra: true,
      postalCode: true,
      city: true,
      province: true,
    },
  },
  professionalProfile: { select: { businessName: true, userId: true, user: { select: { name: true, surname: true } } } },
  quote: { select: { guidedRequest: { select: { city: true, address: true, description: true, category: { select: { label: true } } } } } },
} as const;

type AddressFields = {
  street: string | null;
  houseNumber: string | null;
  addressExtra: string | null;
  postalCode: string | null;
  city: string | null;
  province: string | null;
};

export type BookingForCalendar = AddressFields & {
  id: string;
  scheduledAt: Date;
  scheduledEndAt: Date | null;
  recipientName: string | null;
  recipientSurname: string | null;
  recipientPhone: string | null;
  client: AddressFields & {
    name: string | null;
    surname: string | null;
    phone: string | null;
    email: string | null;
    deletedAt: Date | null;
  };
  professionalProfile: { businessName: string; user: { name: string | null; surname: string | null } };
  quote: { guidedRequest: { city: string | null; address: string | null; description: string | null; category: { label: string } } } | null;
};

export type BookingPeople = {
  businessName: string;
  professionalFullName: string | null;
  clientName: string | null;
  clientPhone: string | null;
  clientEmail: string | null;
  address: string | null;
  city: string | null;
  category: string | null;
  description: string | null;
};

/**
 * Nome, contatti e luogo. Per il cliente prima i dati scritti
 * all'accettazione, poi quelli della richiesta, infine quelli dell'account
 * (prenotazioni dirette dall'agenda); mai quelli di un account cancellato.
 * Li vede il professionista solo a prenotazione creata (CLAUDE.md §5 punto 9).
 */
export function bookingPeople(booking: BookingForCalendar): BookingPeople {
  const { client, professionalProfile } = booking;
  const request = booking.quote?.guidedRequest ?? null;
  const live = client.deletedAt === null;
  const requestAddress = request?.address ? `${request.address}${request.city ? `, ${request.city}` : ""}` : null;
  return {
    businessName: professionalProfile.businessName,
    professionalFullName: [professionalProfile.user.name, professionalProfile.user.surname].filter(Boolean).join(" ") || null,
    clientName:
      [booking.recipientName, booking.recipientSurname].filter(Boolean).join(" ") || [client.name, client.surname].filter(Boolean).join(" ") || null,
    clientPhone: booking.recipientPhone ?? (live ? client.phone : null),
    clientEmail: live ? client.email : null,
    address: formatBookingAddress(booking) ?? requestAddress ?? (live ? formatBookingAddress(client) : null),
    city: booking.city ?? request?.city ?? null,
    category: request?.category.label ?? null,
    description: request?.description ?? null,
  };
}

export type BookingCalendar = {
  /** Link "Aggiungi a Google Calendar"; assente per un annullamento (Google non toglie eventi da un link). */
  calendarUrl: string | null;
  attachment: { filename: string; content: string; contentType: string };
};

/**
 * Evento della prenotazione per chi riceve l'email: stesso `UID` per cliente
 * e professionista e per ogni email, così il calendario aggiorna o toglie lo
 * stesso evento invece di aggiungerne un altro.
 */
export function bookingCalendar(booking: BookingForCalendar, role: "client" | "professional", options: { canceled?: boolean } = {}): BookingCalendar {
  const people = bookingPeople(booking);
  const job = [people.category, people.description].filter(Boolean).join(": ");
  const event: CalendarEvent = {
    uid: `booking-${booking.id}@professionisti`,
    title:
      role === "client"
        ? `${people.category ?? "Intervento"} con ${people.professionalFullName ?? people.businessName}`
        : `${people.category ?? "Intervento"}${people.clientName ? ` da ${people.clientName}` : ""}`,
    start: booking.scheduledAt,
    end: booking.scheduledEndAt,
    location: people.address ?? people.city,
    description: role === "client" ? job : [job, people.clientPhone].filter(Boolean).join("\n"),
    canceled: options.canceled,
  };
  return {
    calendarUrl: options.canceled ? null : googleCalendarUrl(event),
    attachment: {
      filename: options.canceled ? "appuntamento-annullato.ics" : "appuntamento.ics",
      content: calendarIcs(event),
      contentType: `text/calendar; charset=utf-8; method=${options.canceled ? "CANCEL" : "PUBLISH"}`,
    },
  };
}

/** Riga "Calendario": il file .ics è allegato all'email, il link serve a chi usa Google Calendar. */
export function calendarDetail(url: string | null | undefined): { label: string; value: string; url: string }[] {
  return url ? [{ label: "Calendario", value: "Aggiungi a Google Calendar (o apri l'allegato)", url }] : [];
}

/** Email di una notifica con il calendario: la riga col link, o la spiegazione dell'allegato che toglie l'evento. */
export function withCalendar(content: EmailContent, calendar: BookingCalendar): EmailContent {
  if (calendar.calendarUrl) return { ...content, details: [...(content.details ?? []), ...calendarDetail(calendar.calendarUrl)] };
  return { ...content, after: [...(content.after ?? []), "Se avevi aggiunto l'appuntamento al calendario, apri l'allegato per toglierlo."] };
}
