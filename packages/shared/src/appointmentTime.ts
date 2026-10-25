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

const DAY_MONTH = new Intl.DateTimeFormat("it-IT", { timeZone: "UTC", day: "numeric", month: "long" });
const DAY_ONLY = new Intl.DateTimeFormat("it-IT", { timeZone: "UTC", day: "numeric" });

/**
 * Giorni di un lavoro su più giorni (docs/CHANGELOG.md §310): "dal 4 al 6
 * novembre", "dal 30 ottobre al 2 novembre"; `null` se dura un giorno solo.
 */
export function formatJobDays(start: DateLike, end?: DateLike | null): string | null {
  if (!end) return null;
  const startDate = toDate(start);
  const endDate = toDate(end);
  if (!(endDate.getTime() > startDate.getTime())) return null;
  const last = new Date(endDate.getTime() - 1);
  const first = startDate.toISOString().slice(0, 10);
  if (first === last.toISOString().slice(0, 10)) return null;
  const sameMonth = first.slice(0, 7) === last.toISOString().slice(0, 7);
  return `dal ${sameMonth ? DAY_ONLY.format(startDate) : DAY_MONTH.format(startDate)} al ${DAY_MONTH.format(last)}`;
}

/** Quanti giorni dura un lavoro (1 se finisce lo stesso giorno). */
export function jobDayCount(start: DateLike, end?: DateLike | null): number {
  if (!end) return 1;
  const startDay = Date.parse(toDate(start).toISOString().slice(0, 10));
  const endDate = toDate(end);
  if (!(endDate.getTime() > toDate(start).getTime())) return 1;
  const lastDay = Date.parse(new Date(endDate.getTime() - 1).toISOString().slice(0, 10));
  return Math.round((lastDay - startDay) / 86_400_000) + 1;
}

/**
 * Momento dell'appuntamento visto dal cliente (docs/CHANGELOG.md §344): la
 * scheda del lavoro accettato cambia la riga in cima e il pulsante
 * principale a seconda di quanto manca. `onTheWayAt` è l'ora vera in cui il
 * professionista ha premuto "Sto arrivando" (non un'ora di parete).
 */
export type AppointmentMoment =
  | { kind: "days"; days: number }
  | { kind: "tomorrow" }
  | { kind: "today" }
  | { kind: "onTheWay"; since: string }
  | { kind: "inProgress" }
  | { kind: "over" };

/** Per quanto resta in cima "sta arrivando" dopo l'avviso. */
const ON_THE_WAY_MS = 3 * 60 * 60 * 1000;

export function appointmentMoment(start: DateLike, end: DateLike | null | undefined, onTheWayAt: DateLike | null | undefined, now: Date = new Date()): AppointmentMoment {
  const wallNow = wallClockNow(now);
  const startDate = toDate(start);
  // Senza fine nota l'appuntamento dura un'ora, come nel calendario.
  const endDate = end && toDate(end).getTime() > startDate.getTime() ? toDate(end) : new Date(startDate.getTime() + 60 * 60 * 1000);
  if (wallNow.getTime() >= endDate.getTime()) return { kind: "over" };
  if (onTheWayAt && now.getTime() - toDate(onTheWayAt).getTime() < ON_THE_WAY_MS) {
    return { kind: "onTheWay", since: formatAppointmentTime(wallClockNow(toDate(onTheWayAt))) };
  }
  if (wallNow.getTime() >= startDate.getTime()) return { kind: "inProgress" };
  const days = Math.round((Date.parse(startDate.toISOString().slice(0, 10)) - wallClockToday(now).getTime()) / 86_400_000);
  if (days <= 0) return { kind: "today" };
  if (days === 1) return { kind: "tomorrow" };
  return { kind: "days", days };
}
