import type { ProfessionalAvailabilityPreviewDay, ProfessionalSearchResult } from "./professionals";

/**
 * Risultati della ricerca a pagine (scelta di Luca del 16/11,
 * docs/changelog/2026-11-16-pagine-da-20.md): 20 schede per pagina, con
 * filtri e ordine calcolati sul server, e sulla mappa tutti i professionisti
 * trovati come puntini leggeri. Prima il sito scaricava fino a 100 schede
 * complete e filtrava nel browser.
 */
export const RESULTS_PAGE_SIZE = 20;

/** Filtri del pannello "Filtri", uguali per la pagina e per i puntini della mappa. */
export type ResultFilters = {
  /** Solo chi offre consulenza online. */
  online?: boolean;
  /** Intervento urgente: un orario libero nelle prossime 24 ore. */
  urgent?: boolean;
  /** Un orario libero oggi o entro 3 giorni (giorni di calendario). */
  availability?: "today" | "3days";
  /** Lingua parlata. */
  language?: string;
  /** Assicurazione RC professionale dichiarata. */
  insured?: boolean;
  /** Accetta pagamenti online (bollino "Pagamenti online"). */
  onlinePayment?: boolean;
  /** Specializzazione (pagine per servizio, es. /cerca/idraulico/latina/caldaie). */
  subTag?: string;
};

/** Inquadratura della mappa: la lista mostra chi ci sta dentro. */
export type ResultsBounds = { north: number; south: number; east: number; west: number };

/** Puntino della mappa: solo quello che serve al segnaposto e all'elenco sotto la mappa. */
export type ProfessionalPin = Pick<
  ProfessionalSearchResult,
  "id" | "businessName" | "categorySlug" | "categoryLabel" | "categories" | "city" | "latitude" | "longitude" | "imageUrl" | "rating" | "reviewCount" | "verified" | "distanceKm"
> & {
  /** Prestazione cercata che offre (voce di "Quanto costa"), per il link al profilo. */
  matchedServiceName?: string;
};

/** Risposta di GET /professionals/search-page. */
export type ProfessionalSearchPage = {
  /** Le schede della pagina, al massimo `pageSize`, con l'agenda leggera. */
  results: ProfessionalSearchResult[];
  /** Tutti i professionisti trovati con questi filtri (anche nelle altre pagine). */
  total: number;
  /** Pagina mostrata, da 1 (riportata nell'ultima se quella chiesta non esiste più). */
  page: number;
  pageSize: number;
  pageCount: number;
  /** Lingue parlate tra i trovati senza filtri, per il pannello "Lingua parlata". */
  languages: string[];
  /** Nessuno entro il raggio della città: distanza in km del più vicino mostrato. */
  nearestOutsideKm: number | null;
  /** Numeri di tutti i trovati senza i filtri del pannello, per "in breve" e i link alle città. */
  facts: ResultsFacts;
};

/**
 * Riassunto di tutti i trovati (solo la specializzazione della pagina conta):
 * la pagina ha 20 schede, ma "Idraulico a Latina in breve" e "Idraulico nelle
 * città" parlano di tutti.
 */
export type ResultsFacts = {
  count: number;
  /** Con il badge "Verificato". */
  verified: number;
  reviewCount: number;
  /** Somma di stelle per recensioni: la media è ratingSum / reviewCount. */
  ratingSum: number;
  /** Quanti per specializzazione. */
  subTagCounts: Record<string, number>;
  /** Le prime prestazioni offerte, nell'ordine della ricerca (al massimo 3). */
  services: string[];
  /** Città dei trovati con quanti professionisti, le più numerose prima (al massimo 30). */
  cities: { city: string; count: number }[];
};

/** Riassunto dei trovati per `ResultsFacts`. */
export function resultsFacts(
  list: Pick<ProfessionalSearchResult, "verified" | "reviewCount" | "rating" | "subTags" | "services" | "city">[],
): ResultsFacts {
  const subTagCounts: Record<string, number> = {};
  const cities = new Map<string, { city: string; count: number }>();
  const services: string[] = [];
  let verified = 0;
  let reviewCount = 0;
  let ratingSum = 0;
  for (const pro of list) {
    if (pro.verified) verified += 1;
    reviewCount += pro.reviewCount;
    ratingSum += (pro.rating ?? 0) * pro.reviewCount;
    for (const tag of pro.subTags) subTagCounts[tag] = (subTagCounts[tag] ?? 0) + 1;
    for (const service of pro.services) if (services.length < 3 && !services.includes(service.name)) services.push(service.name);
    const key = pro.city.trim().toLowerCase();
    if (!key) continue;
    const entry = cities.get(key) ?? { city: pro.city.trim(), count: 0 };
    entry.count += 1;
    cities.set(key, entry);
  }
  return {
    count: list.length,
    verified,
    reviewCount,
    // Senza le code dei decimali delle somme (4913.299999…).
    ratingSum: Math.round(ratingSum * 100) / 100,
    subTagCounts,
    services,
    cities: [...cities.values()].sort((a, b) => b.count - a.count || a.city.localeCompare(b.city, "it")).slice(0, 30),
  };
}

/** Pagina vuota, quando l'API non risponde (la pagina mostra "Riprova"). */
export function emptyResultsPage(): ProfessionalSearchPage {
  return {
    results: [],
    total: 0,
    page: 1,
    pageSize: RESULTS_PAGE_SIZE,
    pageCount: 1,
    languages: [],
    nearestOutsideKm: null,
    facts: { count: 0, verified: 0, reviewCount: 0, ratingSum: 0, subTagCounts: {}, services: [], cities: [] },
  };
}

/** Filtri attivi, per il numero sul pulsante "Filtri" (la specializzazione non conta: è la pagina stessa). */
export function activeResultFilterCount(filters: ResultFilters): number {
  return [filters.urgent, filters.online, filters.availability, filters.language, filters.insured, filters.onlinePayment].filter(Boolean).length;
}

function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Un orario libero (a domicilio o online) entro `lastOffset` giorni da `from` (0 = solo oggi). */
export function hasFreeSlotWithinDays(days: ProfessionalAvailabilityPreviewDay[], from: string, lastOffset: number): boolean {
  const last = addDays(from, lastOffset);
  return days.some((day) => day.date >= from && day.date <= last && day.times.some((slot) => slot.homeAvailable || slot.onlineAvailable));
}

/**
 * Un orario libero nelle prossime 24 ore reali, non "oggi" di calendario.
 * Data e ora della fascia lette come ora "di parete" in UTC, come in tutto il
 * modulo agenda.
 */
export function hasFreeSlotWithin24h(days: ProfessionalAvailabilityPreviewDay[], now: number): boolean {
  const cutoff = now + 24 * 60 * 60 * 1000;
  return days.some((day) =>
    day.times.some((slot) => {
      if (!(slot.homeAvailable || slot.onlineAvailable)) return false;
      const at = new Date(`${day.date}T${slot.time}:00Z`).getTime();
      return at >= now && at <= cutoff;
    }),
  );
}

/** Filtri che non guardano l'agenda. */
export function matchesProfileFilters(
  pro: Pick<ProfessionalSearchResult, "remoteAvailable" | "spokenLanguages" | "hasLiabilityInsurance" | "stripeVerified" | "subTags">,
  filters: ResultFilters,
): boolean {
  if (filters.online && !pro.remoteAvailable) return false;
  if (filters.language && !pro.spokenLanguages.includes(filters.language)) return false;
  if (filters.insured && !pro.hasLiabilityInsurance) return false;
  if (filters.onlinePayment && !pro.stripeVerified) return false;
  if (filters.subTag && !pro.subTags.includes(filters.subTag)) return false;
  return true;
}

/** Giorni di agenda che servono ai filtri di disponibilità (oggi, domani, dopodomani). */
export const FILTER_AGENDA_DAYS = 3;

/** Filtri sull'agenda: `days` deve coprire almeno i prossimi FILTER_AGENDA_DAYS giorni. */
export function matchesAvailabilityFilters(days: ProfessionalAvailabilityPreviewDay[], from: string, filters: ResultFilters, now: number): boolean {
  if (filters.urgent && !hasFreeSlotWithin24h(days, now)) return false;
  if (filters.availability === "today" && !hasFreeSlotWithinDays(days, from, 0)) return false;
  if (filters.availability === "3days" && !hasFreeSlotWithinDays(days, from, 2)) return false;
  return true;
}

/** Nomi dei parametri, uguali nell'indirizzo del sito e nella chiamata all'API. */
export const RESULT_FILTER_PARAMS = {
  online: "online",
  urgent: "urgente",
  availability: "disponibilita",
  language: "lingua",
  insured: "assicurati",
  onlinePayment: "pagamento",
  subTag: "specializzazione",
  page: "pagina",
} as const;

/** Filtri da un insieme di parametri (indirizzo del sito o chiamata all'API). Valori sconosciuti ignorati. */
export function parseResultFilters(get: (name: string) => string | null | undefined): ResultFilters {
  const flag = (name: string) => get(name) === "1";
  const availability = get(RESULT_FILTER_PARAMS.availability);
  const language = get(RESULT_FILTER_PARAMS.language)?.trim().slice(0, 40);
  const subTag = get(RESULT_FILTER_PARAMS.subTag)?.trim().slice(0, 60);
  return {
    ...(flag(RESULT_FILTER_PARAMS.online) ? { online: true } : {}),
    ...(flag(RESULT_FILTER_PARAMS.urgent) ? { urgent: true } : {}),
    ...(availability === "today" || availability === "3days" ? { availability } : {}),
    ...(language ? { language } : {}),
    ...(flag(RESULT_FILTER_PARAMS.insured) ? { insured: true } : {}),
    ...(flag(RESULT_FILTER_PARAMS.onlinePayment) ? { onlinePayment: true } : {}),
    ...(subTag ? { subTag } : {}),
  };
}

/** Parametri per i filtri attivi (solo quelli accesi). */
export function resultFilterEntries(filters: ResultFilters): [string, string][] {
  const entries: [string, string][] = [];
  if (filters.online) entries.push([RESULT_FILTER_PARAMS.online, "1"]);
  if (filters.urgent) entries.push([RESULT_FILTER_PARAMS.urgent, "1"]);
  if (filters.availability) entries.push([RESULT_FILTER_PARAMS.availability, filters.availability]);
  if (filters.language) entries.push([RESULT_FILTER_PARAMS.language, filters.language]);
  if (filters.insured) entries.push([RESULT_FILTER_PARAMS.insured, "1"]);
  if (filters.onlinePayment) entries.push([RESULT_FILTER_PARAMS.onlinePayment, "1"]);
  if (filters.subTag) entries.push([RESULT_FILTER_PARAMS.subTag, filters.subTag]);
  return entries;
}

/**
 * Parametri di una chiamata a `GET /professionals/search-page` (e, senza
 * pagina né inquadratura, a `/professionals/pins`): filtri, pagina e
 * inquadratura della mappa. Li passa al client dell'API chi li chiama.
 */
export function resultsPageQuery(filters: ResultFilters, page = 1, bounds?: ResultsBounds): [string, string][] {
  const entries = resultFilterEntries(filters);
  if (page > 1) entries.push([RESULT_FILTER_PARAMS.page, String(page)]);
  if (bounds) {
    entries.push(["nord", String(bounds.north)], ["sud", String(bounds.south)], ["est", String(bounds.east)], ["ovest", String(bounds.west)]);
  }
  return entries;
}

/** Numeri sotto le schede (`ResultsPager` del sito): Pagine da mostrare: la prima, l'ultima e le vicine a quella aperta, con "…" in mezzo. */
export function pagerItems(page: number, pageCount: number): (number | "gap")[] {
  const wanted = new Set([1, pageCount, page - 1, page, page + 1].filter((n) => n >= 1 && n <= pageCount));
  // Con un solo numero saltato si mostra il numero, non "…".
  if (wanted.has(3) && !wanted.has(2) && pageCount >= 3) wanted.add(2);
  if (wanted.has(pageCount - 2) && !wanted.has(pageCount - 1)) wanted.add(pageCount - 1);
  const sorted = [...wanted].sort((a, b) => a - b);
  const items: (number | "gap")[] = [];
  for (const n of sorted) {
    const last = items[items.length - 1];
    if (typeof last === "number" && n - last > 1) items.push("gap");
    items.push(n);
  }
  return items;
}

/** Numero di pagina dall'indirizzo: 1 se manca o non è valido. */
export function parseResultsPage(value: string | null | undefined): number {
  const page = Number(value);
  return Number.isInteger(page) && page >= 1 && page <= 1000 ? page : 1;
}
