/**
 * Utility di date per i calendari dashboard (/dashboard/agenda). Stessa
 * convenzione "data pura in UTC, nessuna libreria di fuso orario" già in
 * uso in tutto il modulo agenda (vedi getPublicAgenda lato API): un giorno
 * è sempre mezzanotte UTC, mai convertito al fuso del browser.
 */

const WEEKDAY_LABELS_SHORT = ["Dom", "Lun", "Mar", "Mer", "Gio", "Ven", "Sab"];
const MONTH_LABELS = [
  "Gennaio",
  "Febbraio",
  "Marzo",
  "Aprile",
  "Maggio",
  "Giugno",
  "Luglio",
  "Agosto",
  "Settembre",
  "Ottobre",
  "Novembre",
  "Dicembre",
];

export function startOfDayUtc(date: Date): Date {
  const result = new Date(date);
  result.setUTCHours(0, 0, 0, 0);
  return result;
}

export function todayUtc(): Date {
  return startOfDayUtc(new Date());
}

export function addDaysUtc(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

export function addMonthsUtc(date: Date, months: number): Date {
  const result = new Date(date);
  result.setUTCMonth(result.getUTCMonth() + months);
  return result;
}

/** Lunedì della settimana che contiene `date` (getUTCDay: 0=domenica...6=sabato). */
export function startOfWeekUtc(date: Date): Date {
  const day = date.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  return addDaysUtc(date, diff);
}

export function startOfMonthUtc(date: Date): Date {
  const result = new Date(date);
  result.setUTCDate(1);
  result.setUTCHours(0, 0, 0, 0);
  return result;
}

export function isSameDateUtc(a: Date, b: Date): boolean {
  return toIsoDate(a) === toIsoDate(b);
}

export function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function parseIsoDate(dateStr: string): Date {
  return startOfDayUtc(new Date(`${dateStr}T00:00:00.000Z`));
}

export function weekdayShortLabel(date: Date): string {
  return WEEKDAY_LABELS_SHORT[date.getUTCDay()] ?? "";
}

export function monthLabel(date: Date): string {
  return MONTH_LABELS[date.getUTCMonth()] ?? "";
}

/** Griglia mensile completa (settimane da Lunedì a Domenica, padding con i mesi adiacenti). */
export function monthGridDays(anchor: Date): Date[] {
  const firstOfMonth = startOfMonthUtc(anchor);
  const gridStart = startOfWeekUtc(firstOfMonth);
  const days: Date[] = [];
  for (let i = 0; i < 42; i++) {
    days.push(addDaysUtc(gridStart, i));
  }
  return days;
}

export function weekDays(anchor: Date): Date[] {
  const start = startOfWeekUtc(anchor);
  return Array.from({ length: 7 }, (_, i) => addDaysUtc(start, i));
}

/**
 * True se una fascia (dayOfWeek + date opzionale) vale per `dateStr` — stessa
 * logica di apps/api/src/common/availability.util.ts (slotAppliesOnDate),
 * duplicata qui lato client per il calcolo "dal vivo" di /dashboard/agenda
 * (evidenziare le fasce esistenti in una colonna, calcolare sovrapposizioni)
 * senza un round-trip al server.
 */
export function slotAppliesOnDateStr(slot: { dayOfWeek: number; date?: string | null }, dateStr: string): boolean {
  if (slot.date) return slot.date === dateStr;
  return slot.dayOfWeek === parseIsoDate(dateStr).getUTCDay();
}

/** Tutte le date (ISO) del mese di calendario che contiene `monthAnchor`. */
export function datesInMonth(monthAnchor: Date): string[] {
  const firstOfMonth = startOfMonthUtc(monthAnchor);
  const results: string[] = [];
  let current = firstOfMonth;
  while (current.getUTCMonth() === firstOfMonth.getUTCMonth()) {
    results.push(toIsoDate(current));
    current = addDaysUtc(current, 1);
  }
  return results;
}

/**
 * Tutte le date (ISO) del mese di calendario che contiene `monthAnchor` che
 * cadono su `dayOfWeek` (0=domenica...6=sabato) — a differenza di
 * `datesInMonthForWeekday`, il giorno della settimana è scelto
 * indipendentemente dalla data di ancoraggio (usata dalla selezione "giorni
 * della settimana interi" nell'eliminazione massiva delle fasce).
 */
export function datesInMonthForGivenWeekday(monthAnchor: Date, dayOfWeek: number): string[] {
  return datesInMonth(monthAnchor).filter((dateStr) => parseIsoDate(dateStr).getUTCDay() === dayOfWeek);
}

/**
 * Tutte le date (ISO) del mese di calendario che contiene `anchorDateStr`
 * che cadono sullo stesso giorno della settimana di quella data — usata
 * dalla spunta "ripeti per tutti i <giorno> del mese" nell'editor di
 * fascia oraria (richiesta esplicita dell'utente): crea una fascia per
 * ciascuna, invece di introdurre un concetto di ricorrenza aperta.
 */
export function datesInMonthForWeekday(anchorDateStr: string): string[] {
  const anchor = parseIsoDate(anchorDateStr);
  return datesInMonthForGivenWeekday(anchor, anchor.getUTCDay());
}

export function formatDayRangeLabel(start: Date, end: Date): string {
  const sameMonth = start.getUTCMonth() === end.getUTCMonth() && start.getUTCFullYear() === end.getUTCFullYear();
  const startLabel = start.getUTCDate();
  const endLabel = `${end.getUTCDate()} ${monthLabel(end)} ${end.getUTCFullYear()}`;
  return sameMonth ? `${startLabel} – ${endLabel}` : `${startLabel} ${monthLabel(start)} – ${endLabel}`;
}
