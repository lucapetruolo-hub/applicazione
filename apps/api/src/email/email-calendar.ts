import { EMAIL_BRAND } from "./email-brand";
import { jobOccurrences } from "@professionisti/shared";

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
  /** Annullato: il calendario toglie l'evento con lo stesso `uid`. */
  canceled?: boolean;
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
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
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

/**
 * Versione dell'evento: deve crescere a ogni nuova email sullo stesso
 * appuntamento perché il calendario prenda l'ultima (annullato, riaperto).
 * Secondi dal 1° gennaio 2026: crescono sempre, senza salvarli da nessuna parte.
 */
function sequence(): number {
  return Math.max(0, Math.floor((Date.now() - Date.UTC(2026, 0, 1)) / 1000));
}

const ROME_TIMEZONE = [
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
];

/**
 * Un lavoro su più giorni (docs/CHANGELOG.md §310) diventa il suo primo
 * giorno ripetuto ogni giorno: nel calendario compare un appuntamento per
 * giorno con lo stesso orario, non un blocco unico notte compresa.
 */
function dailyRepeat(event: CalendarEvent): { event: CalendarEvent; days: number } {
  const occurrences = jobOccurrences(event.start, event.end);
  if (occurrences.length === 1) return { event, days: 1 };
  return { event: { ...event, start: occurrences[0]!.start, end: occurrences[0]!.end }, days: occurrences.length };
}

function eventLines(original: CalendarEvent, withOrganizer: boolean): string[] {
  const { event, days } = dailyRepeat(original);
  return [
    "BEGIN:VEVENT",
    `UID:${event.uid}`,
    `SEQUENCE:${sequence()}`,
    `STATUS:${event.canceled ? "CANCELLED" : "CONFIRMED"}`,
    // Richiesto dallo standard per un annullamento (RFC 5546): l'assistenza.
    ...(withOrganizer ? [`ORGANIZER;CN="${EMAIL_BRAND.name.replace(/"/g, "")}":mailto:${EMAIL_BRAND.supportEmail}`] : []),
    `DTSTAMP:${new Date().toISOString().slice(0, 19).replace(/[-:]/g, "")}Z`,
    `DTSTART;TZID=Europe/Rome:${wallClock(event.start)}`,
    `DTEND;TZID=Europe/Rome:${wallClock(endOf(event))}`,
    ...(days > 1 ? [`RRULE:FREQ=DAILY;COUNT=${days}`] : []),
    `SUMMARY:${icsText(event.title)}`,
    ...(event.location?.trim() ? [`LOCATION:${icsText(event.location.trim())}`] : []),
    ...(event.description?.trim() ? [`DESCRIPTION:${icsText(event.description.trim())}`] : []),
    "END:VEVENT",
  ];
}

/** File .ics con un solo evento, in ora italiana. */
export function calendarIcs(event: CalendarEvent): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:-//${icsText(EMAIL_BRAND.name)}//Promemoria//IT`,
    "CALSCALE:GREGORIAN",
    `METHOD:${event.canceled ? "CANCEL" : "PUBLISH"}`,
    ...ROME_TIMEZONE,
    ...eventLines(event, true),
    "END:VCALENDAR",
  ];
  return lines.map(fold).join("\r\n") + "\r\n";
}

/**
 * Calendario collegato dall'agenda (docs/CHANGELOG.md §288): tutti gli
 * appuntamenti in un file che Google Calendar e iPhone rileggono da soli.
 */
export function calendarFeedIcs(name: string, events: CalendarEvent[]): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:-//${icsText(EMAIL_BRAND.name)}//Agenda//IT`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${icsText(name)}`,
    "X-WR-TIMEZONE:Europe/Rome",
    // Ogni ora, per chi lo rispetta (iPhone sì, Google decide da sé).
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
    ...ROME_TIMEZONE,
    ...events.flatMap((event) => eventLines(event, false)),
    "END:VCALENDAR",
  ];
  return lines.map(fold).join("\r\n") + "\r\n";
}

/** Link "Aggiungi a Google Calendar" con lo stesso evento. */
export function googleCalendarUrl(original: CalendarEvent): string {
  const { event, days } = dailyRepeat(original);
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.title,
    dates: `${wallClock(event.start)}/${wallClock(endOf(event))}`,
    ctz: "Europe/Rome",
  });
  if (event.location?.trim()) params.set("location", event.location.trim());
  if (event.description?.trim()) params.set("details", event.description.trim());
  if (days > 1) params.set("recur", `RRULE:FREQ=DAILY;COUNT=${days}`);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
