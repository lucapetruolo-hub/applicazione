/**
 * Mesi e giorni contabili all'ora di Roma: una trattenuta delle 00:30 del 1°
 * novembre è di novembre anche se in UTC è ancora ottobre.
 */
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

function romeWall(date: Date): { y: number; m: number; d: number; h: number; mi: number; s: number } {
  const parts = Object.fromEntries(ROME_PARTS.formatToParts(date).map((p) => [p.type, p.value]));
  return { y: Number(parts.year), m: Number(parts.month), d: Number(parts.day), h: Number(parts.hour), mi: Number(parts.minute), s: Number(parts.second) };
}

function romeOffsetMs(date: Date): number {
  const w = romeWall(date);
  return Date.UTC(w.y, w.m - 1, w.d, w.h, w.mi, w.s) - Math.floor(date.getTime() / 1000) * 1000;
}

/** Mezzanotte di un giorno a Roma, come istante. */
function romeMidnight(year: number, month: number, day: number): Date {
  const wall = Date.UTC(year, month - 1, day);
  // Lo scarto di mezzanotte può differire da quello di un'ora dopo nei giorni del cambio d'ora.
  return new Date(wall - romeOffsetMs(new Date(wall - romeOffsetMs(new Date(wall)))));
}

const pad = (n: number) => String(n).padStart(2, "0");

/** "2026-10" per una data, all'ora di Roma. */
export function romeMonthOf(date: Date): string {
  const w = romeWall(date);
  return `${w.y}-${pad(w.m)}`;
}

/** "2026-10-31" per una data, all'ora di Roma. */
export function romeDayIso(date: Date): string {
  const w = romeWall(date);
  return `${w.y}-${pad(w.m)}-${pad(w.d)}`;
}

/** "31/10/2026". */
export function romeDayLabel(date: Date): string {
  const w = romeWall(date);
  return `${pad(w.d)}/${pad(w.m)}/${w.y}`;
}

/** Inizio (compreso) e fine (esclusa) di un mese AAAA-MM all'ora di Roma. */
export function romeMonthRange(month: string): { start: Date; end: Date } {
  const [y, m] = month.split("-").map(Number) as [number, number];
  return { start: romeMidnight(y, m, 1), end: m === 12 ? romeMidnight(y + 1, 1, 1) : romeMidnight(y, m + 1, 1) };
}

/** Mezzanotte di Roma di un giorno "2026-11-01". */
export function romeDayStart(dayIso: string): Date {
  const [y, m, d] = dayIso.split("-").map(Number) as [number, number, number];
  return romeMidnight(y, m, d);
}

/** Il mese prima: "2026-01" → "2025-12". */
export function previousMonth(month: string): string {
  const [y, m] = month.split("-").map(Number) as [number, number];
  return m === 1 ? `${y - 1}-12` : `${y}-${pad(m - 1)}`;
}

/** Ultimo giorno del mese, "2026-10-31": data delle fatture differite. */
export function lastDayOfMonth(month: string): string {
  const [y, m] = month.split("-").map(Number) as [number, number];
  return `${month}-${pad(new Date(Date.UTC(y, m, 0)).getUTCDate())}`;
}
