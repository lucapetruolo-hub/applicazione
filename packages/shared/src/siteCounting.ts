/**
 * Pezzi dei conteggi del sito (docs/CHANGELOG.md §372) usati anche nelle
 * pagine pubbliche: senza zod, così il sito non lo carica in ogni pagina
 * solo per sapere se contare una visita.
 */

/**
 * Robot e browser automatici (Google, Bing, anteprime dei social, browser
 * senza schermo): non contano mai. Un nome vuoto conta come robot.
 */
export function isBotUserAgent(userAgent: string | null | undefined): boolean {
  if (!userAgent) return true;
  return /bot\b|bot\/|crawl|spider|slurp|headless|lighthouse|pagespeed|facebookexternalhit|whatsapp\/|curl\/|wget\/|python-requests|node-fetch|axios\//i.test(userAgent);
}

/** Cookie che dice "non contare questo browser" (admin e chi prova il sito). */
export const NO_COUNT_COOKIE = "non_contare";

/**
 * Parola cercata ripulita per contarla (§372): minuscole, spazi singoli.
 * `null` se non è un lavoro: con cifre o "@" (telefoni, email), più di 3
 * parole, o troppo corta o lunga.
 */
export function normalizeJobTerm(text: string): string | null {
  const term = text.normalize("NFC").toLowerCase().replace(/\s+/g, " ").trim();
  if (term.length < 3 || term.length > 40) return null;
  if (/[\d@]/.test(term)) return null;
  if (term.split(" ").length > 3) return null;
  return term;
}

/** Inizio della settimana (lunedì) di una data, come "AAAA-MM-GG" in ora di Roma. */
export function romeWeekStart(date: Date): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit", weekday: "short" })
      .formatToParts(date)
      .map((p) => [p.type, p.value]),
  ) as Record<string, string>;
  const day = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day)));
  const offset = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(parts.weekday ?? "Mon");
  day.setUTCDate(day.getUTCDate() - offset);
  return day.toISOString().slice(0, 10);
}
