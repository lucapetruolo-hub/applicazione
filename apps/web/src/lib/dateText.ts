/**
 * Date scritte a mano nei campi data del sito (ItalianDateInput,
 * docs/changelog/2026-11-11-campo-data-scrivibile.md): si accettano i modi in
 * cui una persona scrive una data ("101126", "10112026", "10/11", "10-11-26",
 * "10.11.2026", anche "2026-11-10" incollata) e si riportano sempre ad
 * "AAAA-MM-GG", il valore del campo data del browser.
 */

const pad = (n: number) => String(n).padStart(2, "0");

export const MONTHS = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];
export const WEEKDAYS = ["lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato", "domenica"];

/** "AAAA-MM-GG" di oggi, con l'ora del telefono. */
export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function isoOf(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || year < 1000 || year > 9999) return null;
  const last = new Date(year, month, 0).getDate();
  return day > last ? null : `${year}-${pad(month)}-${pad(day)}`;
}

/** "AAAA-MM-GG" → "GG/MM/AAAA"; "" se il valore non è una data. */
export function shownDate(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}

/** Giorno della settimana e data per esteso, per il lettore di schermo: "mercoledì 11 novembre 2026". */
export function longDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  const weekday = WEEKDAYS[(new Date(y, m - 1, d).getDay() + 6) % 7];
  return `${weekday} ${d} ${MONTHS[m - 1]} ${y}`;
}

/**
 * Data "AAAA-MM-GG" da quello che la persona ha scritto, o null se non si
 * capisce o non esiste (31/02). Senza anno vale l'anno in corso (il prossimo
 * se così sarebbe prima di `min`); con due cifre è il 2000, o il 1900 se
 * così andrebbe oltre `max` (le date di nascita).
 */
export function parseTypedDate(text: string, { min, max }: { min?: string; max?: string } = {}): string | null {
  const t = text.trim();
  if (!t) return null;
  const iso = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) return isoOf(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  let parts: string[];
  if (/^\d+$/.test(t)) {
    if (t.length === 4) parts = [t.slice(0, 2), t.slice(2)];
    else if (t.length === 6 || t.length === 8) parts = [t.slice(0, 2), t.slice(2, 4), t.slice(4)];
    else return null;
  } else {
    const sep = t.match(/^(\d{1,2})\s*[/.\-\s]\s*(\d{1,2})(?:\s*[/.\-\s]\s*(\d{2}|\d{4}))?$/);
    if (!sep) return null;
    parts = sep[3] ? [sep[1]!, sep[2]!, sep[3]] : [sep[1]!, sep[2]!];
  }
  const day = Number(parts[0]);
  const month = Number(parts[1]);
  const thisYear = new Date().getFullYear();
  const maxYear = max ? Number(max.slice(0, 4)) : Infinity;

  if (parts.length === 2) {
    const guess = isoOf(thisYear, month, day);
    if (guess && min && guess < min) return isoOf(thisYear + 1, month, day);
    return guess;
  }
  const yearText = parts[2]!;
  let year = Number(yearText);
  if (yearText.length === 2) year = 2000 + year > maxYear ? 1900 + year : 2000 + year;
  return isoOf(year, month, day);
}

/**
 * Testo mentre si scrive: le barre si mettono da sole ("101126" → "10/11/26",
 * anche scrivendo una cifra alla volta) e vanno bene anche quelle scritte a
 * mano o altri separatori ("1/11", "10-11-2026").
 */
export function formatDateWhileTyping(raw: string): string {
  // Data incollata nel formato del sistema ("2026-11-10"): resta com'è.
  if (/^\d{4}-/.test(raw)) return raw.replace(/[^\d-]/g, "").slice(0, 10);
  const queue = raw
    .replace(/[^\d/.\-\s]/g, "")
    .split(/[/.\-\s]/)
    .map((g) => g.replace(/\D/g, ""));
  const out: string[] = [];
  while (queue.length && out.length < 3) {
    const group = queue.shift()!;
    if (out.length < 2 && group.length > 2) {
      out.push(group.slice(0, 2));
      queue.unshift(group.slice(2));
    } else {
      out.push(out.length === 2 ? group.slice(0, 4) : group);
    }
  }
  return out.join("/");
}

/** Data completa e senza dubbi mentre si scrive (anno di 4 cifre), da passare subito alla pagina. */
export function completeTypedDate(text: string): string | null {
  if (!/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(text) && !/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  return parseTypedDate(text);
}

/** Sposta una data "AAAA-MM-GG" di `days` giorni. */
export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  const next = new Date(y, m - 1, d + days);
  return `${next.getFullYear()}-${pad(next.getMonth() + 1)}-${pad(next.getDate())}`;
}

/** Sposta una data di `months` mesi, fermandosi all'ultimo giorno del mese (31/01 + 1 → 28/02). */
export function addMonths(iso: string, months: number): string {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  const first = new Date(y, m - 1 + months, 1);
  const last = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  return `${first.getFullYear()}-${pad(first.getMonth() + 1)}-${pad(Math.min(d, last))}`;
}
