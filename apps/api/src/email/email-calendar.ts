import { EMAIL_BRAND } from "./email-brand";

/**
 * "Aggiungi al calendario" nei promemoria (docs/CHANGELOG.md §235): un file
 * .ics allegato (Apple Calendar, Outlook, Gmail lo riconoscono) e un link a
 * Google Calendar. Gli appuntamenti sono salvati come ora "di parete" in UTC
 * (vedi email-format.ts): si leggono i campi UTC e si scrivono come ora
 * italiana, senza spostarli.
 */
export type CalendarEvent = {
  /** Identificativo stabile: lo stesso appuntamento non si duplica nel calendario. */
  uid: string;
  title: string;
  start: Date;
  /** Fine della fascia; senza, l'evento dura un'ora. */
  end?: Date | null;
  location?: string | null;
  description?: string | null;
};

const DEFAULT_DURATION_MS = 60 * 60 * 1000;

function endOf(event: CalendarEvent): Date {
  return event.end && event.end.getTime() > event.start.getTime() ? event.end : new Date(event.start.getTime() + DEFAULT_DURATION_MS);
}

/** 2026-10-15T09:00Z (ora di parete) → "20261015T090000" */
function wallClock(date: Date): string {
  return date.toISOString().slice(0, 19).replace(/[-:]/g, "");
}

/** Testo per un campo iCalendar: barre, virgole, punti e virgola e a capo scappati. */
function icsText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** Righe oltre 75 byte spezzate come vuole lo standard (RFC 5545 §3.1). */
function fold(line: string): string {
  const out: string[] = [];
  let current = "";
  for (const char of line) {
    if (Buffer.byteLength(current + char) > (out.length === 0 ? 75 : 74)) {
      out.push(current);
      current = "";
    }
    current += char;
  }
  out.push(current);
  return out.join("\r\n ");
}

/** File .ics con un solo evento, in ora italiana. */
export function calendarIcs(event: CalendarEvent): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:-//${icsText(EMAIL_BRAND.name)}//Promemoria//IT`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VTIMEZONE",
    "TZID:Europe/Rome",
    "BEGIN:DAYLIGHT",
    "TZOFFSETFROM:+0100",
    "TZOFFSETTO:+0200",
    "TZNAME:CEST",
    "DTSTART:19700329T020000",
    "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU",
    "END:DAYLIGHT",
    "BEGIN:STANDARD",
    "TZOFFSETFROM:+0200",
    "TZOFFSETTO:+0100",
    "TZNAME:CET",
    "DTSTART:19701025T030000",
    "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU",
    "END:STANDARD",
    "END:VTIMEZONE",
    "BEGIN:VEVENT",
    `UID:${event.uid}`,
    `DTSTAMP:${new Date().toISOString().slice(0, 19).replace(/[-:]/g, "")}Z`,
    `DTSTART;TZID=Europe/Rome:${wallClock(event.start)}`,
    `DTEND;TZID=Europe/Rome:${wallClock(endOf(event))}`,
    `SUMMARY:${icsText(event.title)}`,
    ...(event.location?.trim() ? [`LOCATION:${icsText(event.location.trim())}`] : []),
    ...(event.description?.trim() ? [`DESCRIPTION:${icsText(event.description.trim())}`] : []),
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(fold).join("\r\n") + "\r\n";
}

/** Link "Aggiungi a Google Calendar" con lo stesso evento. */
export function googleCalendarUrl(event: CalendarEvent): string {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.title,
    dates: `${wallClock(event.start)}/${wallClock(endOf(event))}`,
    ctz: "Europe/Rome",
  });
  if (event.location?.trim()) params.set("location", event.location.trim());
  if (event.description?.trim()) params.set("details", event.description.trim());
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
