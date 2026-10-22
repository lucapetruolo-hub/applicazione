/**
 * Orari degli appuntamenti (docs/CHANGELOG.md §287). `Booking.scheduledAt`,
 * `Quote.estimatedStartDate`, `ExternalJob.scheduledAt` e le fasce
 * dell'agenda sono salvati come ora "di parete" italiana scritta in UTC: un
 * lavoro alle 09:00 è `...T09:00:00.000Z`, d'estate come d'inverno. Si
 * mostrano quindi sempre in UTC, mai nel fuso del browser (che li sposterebbe
 * di un'ora o due). Per confrontarli con "adesso" si usa `wallClockNow()`,
 * l'ora italiana di questo momento scritta allo stesso modo.
 */

type DateLike = Date | string;

const TIME = new Intl.DateTimeFormat("it-IT", { timeZone: "UTC", hour: "2-digit", minute: "2-digit" });
const ROME_PARTS = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Rome",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function toDate(value: DateLike): Date {
  return value instanceof Date ? value : new Date(value);
}

/** "09:00" */
export function formatAppointmentTime(value: DateLike): string {
  return TIME.format(toDate(value));
}

/** "09:00–13:00", o solo "09:00" senza fine. */
export function formatAppointmentTimeRange(start: DateLike, end?: DateLike | null): string {
  return end ? `${formatAppointmentTime(start)}–${formatAppointmentTime(end)}` : formatAppointmentTime(start);
}

/** Giorno dell'appuntamento con le opzioni di `toLocaleDateString` (fuso fisso). */
export function formatAppointmentDate(value: DateLike, options: Omit<Intl.DateTimeFormatOptions, "timeZone">): string {
  return toDate(value).toLocaleDateString("it-IT", { ...options, timeZone: "UTC" });
}

/** L'ora italiana di `now` scritta come ora di parete in UTC, per confrontarla con gli appuntamenti. */
export function wallClockNow(now: Date = new Date()): Date {
  const parts = Object.fromEntries(ROME_PARTS.formatToParts(now).map((p) => [p.type, p.value]));
  return new Date(
    Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second)),
  );
}

/** Mezzanotte del giorno di oggi in Italia, nella stessa convenzione. */
export function wallClockToday(now: Date = new Date()): Date {
  const today = wallClockNow(now);
  today.setUTCHours(0, 0, 0, 0);
  return today;
}
