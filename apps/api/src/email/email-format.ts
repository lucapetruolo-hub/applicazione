/**
 * Date e importi nelle email. Gli appuntamenti (`Booking.scheduledAt`,
 * `Quote.estimatedStartDate`) sono salvati come ora "di parete" in UTC, come
 * nel resto del sito: si formattano in UTC per non spostarli di un'ora o due.
 * Le scadenze vere (abbonamento, 48/72 ore) sono istanti reali: ora italiana.
 */
const APPOINTMENT = new Intl.DateTimeFormat("it-IT", {
  timeZone: "UTC",
  weekday: "long",
  day: "numeric",
  month: "long",
  hour: "2-digit",
  minute: "2-digit",
});
const APPOINTMENT_DAY = new Intl.DateTimeFormat("it-IT", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" });
const APPOINTMENT_TIME = new Intl.DateTimeFormat("it-IT", { timeZone: "UTC", hour: "2-digit", minute: "2-digit" });
const DAY_ROME = new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", day: "numeric", month: "long", year: "numeric" });
const DEADLINE_ROME = new Intl.DateTimeFormat("it-IT", {
  timeZone: "Europe/Rome",
  weekday: "long",
  day: "numeric",
  month: "long",
  hour: "2-digit",
  minute: "2-digit",
});

function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** "martedì 14 ottobre, 09:00" */
export function formatAppointment(value: Date | string | null | undefined): string {
  const date = toDate(value);
  return date ? APPOINTMENT.format(date) : "";
}

/** "martedì 14 ottobre" */
export function formatAppointmentDay(value: Date | string | null | undefined): string {
  const date = toDate(value);
  return date ? APPOINTMENT_DAY.format(date) : "";
}

/** "09:00" */
export function formatAppointmentTime(value: Date | string | null | undefined): string {
  const date = toDate(value);
  return date ? APPOINTMENT_TIME.format(date) : "";
}

/** "14 ottobre 2026" (ora italiana) */
export function formatDay(value: Date | string | null | undefined): string {
  const date = toDate(value);
  return date ? DAY_ROME.format(date) : "";
}

/** "giovedì 16 ottobre, 10:30" (ora italiana) */
export function formatDeadline(value: Date | string | null | undefined): string {
  const date = toDate(value);
  return date ? DEADLINE_ROME.format(date) : "";
}

/** 12050 → "€120,50", 12000 → "€120" */
export function formatEur(cents: unknown): string {
  if (typeof cents !== "number" || !Number.isFinite(cents)) return "";
  return `€${(cents / 100).toLocaleString("it-IT", { minimumFractionDigits: cents % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;
}
