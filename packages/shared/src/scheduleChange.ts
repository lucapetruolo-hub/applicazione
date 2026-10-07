/**
 * Cosa cambia tra due appuntamenti (data, orario o entrambi), per dire
 * all'altra parte esattamente cosa è stato modificato invece di un generico
 * "orario" o "data" (docs/CHANGELOG.md §180). Stessa convenzione "wall clock
 * UTC" dell'agenda: giorno e ora si leggono dalla stringa ISO, mai dal fuso
 * di chi legge.
 */
export type ScheduleChange = "date" | "time" | "both";

type DateLike = Date | string;

function iso(value: DateLike): string {
  return typeof value === "string" ? new Date(value).toISOString() : value.toISOString();
}

/** `null` se data e orario (inizio e, quando note, fine) restano uguali. */
export function scheduleChangeBetween(
  before: { start: DateLike; end?: DateLike | null },
  after: { start: DateLike; end?: DateLike | null },
): ScheduleChange | null {
  const b = iso(before.start);
  const a = iso(after.start);
  const dateChanged = b.slice(0, 10) !== a.slice(0, 10);
  const endChanged = before.end && after.end ? iso(before.end).slice(11, 16) !== iso(after.end).slice(11, 16) : false;
  const timeChanged = b.slice(11, 16) !== a.slice(11, 16) || endChanged;
  if (dateChanged && timeChanged) return "both";
  if (dateChanged) return "date";
  if (timeChanged) return "time";
  return null;
}

/** Valida un valore letto da un payload JSON (notifiche già salvate senza il campo restano `null`). */
export function asScheduleChange(value: unknown): ScheduleChange | null {
  return value === "date" || value === "time" || value === "both" ? value : null;
}

/** "la data", "l'orario", "la data e l'orario" — per "ha modificato …". */
export function scheduleChangeObject(change: ScheduleChange): string {
  if (change === "date") return "la data";
  if (change === "time") return "l'orario";
  return "la data e l'orario";
}

/** "un'altra data", "un altro orario", "un'altra data e un altro orario" — per "ha proposto …". */
export function scheduleChangeAlternative(change: ScheduleChange): string {
  if (change === "date") return "un'altra data";
  if (change === "time") return "un altro orario";
  return "un'altra data e un altro orario";
}

/** "della data", "dell'orario", "di data e orario" — per "una modifica …". */
export function scheduleChangeOf(change: ScheduleChange): string {
  if (change === "date") return "della data";
  if (change === "time") return "dell'orario";
  return "di data e orario";
}
