import { POPULAR_SERVICES, type ProfessionalCategorySlug } from "./categories";

/**
 * Prestazioni più cercate (docs/CHANGELOG.md §384): una ricerca scritta si
 * confronta con le prestazioni suggerite di `POPULAR_SERVICES` e si conta
 * solo il nome preso dall'elenco, mai il testo scritto dal cliente.
 */

const STOP_WORDS = new Set(["di", "del", "della", "dello", "dei", "degli", "delle", "e", "ed", "a", "al", "alla", "da", "in", "per", "con", "su", "il", "lo", "la", "i", "gli", "le", "un", "una", "uno"]);

/** Più prestazioni di così per una sola ricerca: parola troppo generica ("riparazione"), non si conta. */
export const SERVICE_SEARCH_MAX_MATCHES = 3;

/** Minuscole, senza accenti né punteggiatura: "Riparazione perdita d'acqua" → "riparazione perdita d acqua". */
export function normalizeServiceName(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function meaningfulWords(text: string): string[] {
  return normalizeServiceName(text)
    .split(" ")
    .filter((w) => w.length >= 3 && !STOP_WORDS.has(w));
}

/** "sifone" ~ "sifone", "perdite" ~ "perdita", "rubinet" ~ "rubinetteria". */
function sameWord(searched: string, word: string): boolean {
  if (searched === word) return true;
  if (searched.length >= 4 && word.startsWith(searched)) return true;
  return searched.length >= 5 && word.length >= 5 && searched.slice(0, 5) === word.slice(0, 5);
}

/**
 * Prestazioni dell'elenco che corrispondono alla ricerca: ogni parola
 * cercata deve stare nel nome della prestazione. Con un lavoro scelto si
 * guarda solo il suo elenco. Nessuna corrispondenza se sono più di
 * SERVICE_SEARCH_MAX_MATCHES.
 */
export function matchPopularServices(query: string, categorySlug?: string): { categorySlug: ProfessionalCategorySlug; service: string }[] {
  const searched = meaningfulWords(query);
  if (searched.length === 0 || searched.length > 4) return [];
  const slugs = (Object.keys(POPULAR_SERVICES) as ProfessionalCategorySlug[]).filter((slug) => !categorySlug || slug === categorySlug);
  const matches: { categorySlug: ProfessionalCategorySlug; service: string }[] = [];
  for (const slug of slugs) {
    for (const service of POPULAR_SERVICES[slug]) {
      const words = meaningfulWords(service);
      if (searched.every((s) => words.some((w) => sameWord(s, w)))) matches.push({ categorySlug: slug, service });
    }
  }
  return matches.length > SERVICE_SEARCH_MAX_MATCHES ? [] : matches;
}

/** Una prestazione scritta a mano che c'è già, con un altro modo di scriverla, tra quelle suggerite di quel lavoro. */
export function isPopularService(name: string, categorySlug: ProfessionalCategorySlug): boolean {
  const normalized = normalizeServiceName(name);
  return POPULAR_SERVICES[categorySlug].some((s) => normalizeServiceName(s) === normalized);
}

/** Il professionista offre quella prestazione dell'elenco, anche scritta più lunga ("Sostituzione sifone e tubi"). */
export function offersPopularService(name: string, service: string): boolean {
  const words = meaningfulWords(name);
  const needed = meaningfulWords(service);
  return needed.length > 0 && needed.every((n) => words.some((w) => sameWord(n, w)));
}
