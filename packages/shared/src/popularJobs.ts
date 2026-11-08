import { POPULAR_SERVICES, PROFESSIONAL_CATEGORIES, isProfessionalCategorySlug, type ProfessionalCategorySlug } from "./categories";

/** Un lavoro della sezione "Lavori più cercati" in home: nome dell'elenco suggerito e il suo mestiere. */
export type PopularJob = { service: string; categorySlug: ProfessionalCategorySlug };

export type PopularJobsResponse = {
  jobs: PopularJob[];
  /** "searches": in ordine di ricerche sul sito; "list": nell'ordine dell'elenco. */
  source: "searches" | "list";
};

/** Quanti lavori in home: due righe su computer, tre righe da scorrere da telefono. */
export const POPULAR_JOBS_COUNT = 8;
/** L'elenco in Admin non scende sotto i lavori mostrati in home, così la sezione è sempre piena. */
export const POPULAR_JOBS_MIN = POPULAR_JOBS_COUNT;
/** Né diventa infinito: quelli oltre l'ottavo sono di riserva, salgono se più cercati. */
export const POPULAR_JOBS_MAX = 16;

/**
 * Sotto questa soglia di ricerche (ultimi 90 giorni, dal lancio) l'ordine
 * delle ricerche non dice ancora nulla: vale l'ordine dell'elenco.
 */
export const POPULAR_JOBS_MIN_SEARCHES = 50;

/**
 * Elenco di partenza, finché in Admin nessuno lo cambia: i lavori più cercati
 * su Google (Keyword Planner del 06/11/2026) e nelle 769 frasi dei clienti
 * (docs/CHANGELOG.md §392). Ogni nome è nell'elenco suggerito del suo mestiere
 * (`POPULAR_SERVICES`), così la ricerca trova chi lo offre e le ricerche si contano.
 */
export const DEFAULT_POPULAR_JOBS: readonly PopularJob[] = [
  { service: "Installazione caldaia", categorySlug: "climatizzazione" },
  { service: "Trasformazione vasca in doccia", categorySlug: "idraulico" },
  { service: "Installazione condizionatore", categorySlug: "climatizzazione" },
  { service: "Sturatura scarichi", categorySlug: "idraulico" },
  { service: "Pulizie di casa", categorySlug: "pulizie" },
  { service: "Tinteggiatura interni", categorySlug: "imbianchino" },
  { service: "Apertura porte bloccate", categorySlug: "fabbro" },
  { service: "Riparazione lavatrice", categorySlug: "elettrodomestici" },
  { service: "Installazione tende da sole", categorySlug: "tende-da-sole" },
  { service: "Installazione pompa di calore", categorySlug: "climatizzazione" },
];

/** Il nome è tra le prestazioni suggerite di quel mestiere: solo così si può mettere in home. */
export function isListedPopularJob(job: { service: string; categorySlug: string }): job is PopularJob {
  return isProfessionalCategorySlug(job.categorySlug) && POPULAR_SERVICES[job.categorySlug].includes(job.service);
}

/**
 * L'elenco valido dalle righe salvate in Admin (`popular_jobs`, già in ordine):
 * vuote, o con soli nomi tolti dalle prestazioni suggerite, l'elenco di partenza.
 */
export function popularJobsFromRows(rows: { service: string; categorySlug: string }[]): { jobs: PopularJob[]; custom: boolean } {
  const jobs = rows.filter(isListedPopularJob).map((row) => ({ service: row.service, categorySlug: row.categorySlug }));
  return jobs.length > 0 ? { jobs, custom: true } : { jobs: [...DEFAULT_POPULAR_JOBS], custom: false };
}

/** Le ricerche di un lavoro, sommate tra i mestieri (lo stesso nome può stare in due, es. vasca in doccia). */
export function popularJobSearches(service: string, searches: { service: string; searches: number }[]): number {
  return searches.filter((row) => row.service === service).reduce((sum, row) => sum + Math.max(0, row.searches), 0);
}

/**
 * I lavori da mostrare in home (docs/changelog/2026-11-07-lavori-piu-cercati-home.md):
 * l'elenco scelto in Admin (o quello di partenza); con abbastanza ricerche,
 * prima i più cercati, a parità l'ordine dell'elenco. Solo i primi POPULAR_JOBS_COUNT.
 */
export function orderPopularJobs(
  list: readonly PopularJob[],
  searches: { categorySlug: string; service: string; searches: number }[],
): PopularJobsResponse {
  const total = searches.reduce((sum, row) => sum + Math.max(0, row.searches), 0);
  const seen = new Set<string>();
  const unique = list.filter((job) => {
    const key = job.service.toLocaleLowerCase("it");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (total < POPULAR_JOBS_MIN_SEARCHES) return { jobs: unique.slice(0, POPULAR_JOBS_COUNT), source: "list" };
  // sort è stabile: a parità di ricerche resta l'ordine dell'elenco.
  const ordered = [...unique].sort((a, b) => popularJobSearches(b.service, searches) - popularJobSearches(a.service, searches));
  return { jobs: ordered.slice(0, POPULAR_JOBS_COUNT), source: "searches" };
}

/** Per Admin → Mestieri richiesti → "Lavori più cercati in home". */
export type PopularJobsAdminView = {
  /** false: vale ancora l'elenco di partenza (la prima modifica lo copia). */
  custom: boolean;
  /** Ricerche di lavori dell'elenco suggerito negli ultimi 90 giorni (dal lancio). */
  totalSearches: number;
  source: PopularJobsResponse["source"];
  /** L'elenco nell'ordine scelto, con le ricerche e se oggi compare in home. */
  jobs: (PopularJob & { categoryLabel: string; searches: number; shown: boolean; /** Posto in home (1 = primo), `null` se di riserva. */ homePosition: number | null })[];
  /** Lavori cercati sul sito che non sono nell'elenco, i più cercati prima. */
  missing: (PopularJob & { categoryLabel: string; searches: number })[];
};

const categoryLabel = (slug: string) => PROFESSIONAL_CATEGORIES.find((c) => c.slug === slug)?.label ?? slug;

/** Quanti "cercati ma non in elenco" proporre in Admin. */
const POPULAR_JOBS_MISSING_SHOWN = 6;

export function buildPopularJobsAdminView(
  list: readonly PopularJob[],
  custom: boolean,
  searches: { categorySlug: string; service: string; searches: number }[],
): PopularJobsAdminView {
  const ordered = orderPopularJobs(list, searches);
  const position = new Map(ordered.jobs.map((job, index) => [job.service, index + 1]));
  const inList = new Set(list.map((job) => job.service));
  const missing = new Map<string, PopularJob & { categoryLabel: string; searches: number }>();
  for (const row of searches) {
    if (row.searches <= 0 || inList.has(row.service) || !isListedPopularJob(row)) continue;
    const previous = missing.get(row.service);
    if (previous) previous.searches += row.searches;
    else missing.set(row.service, { service: row.service, categorySlug: row.categorySlug, categoryLabel: categoryLabel(row.categorySlug), searches: row.searches });
  }
  return {
    custom,
    totalSearches: searches.reduce((sum, row) => sum + Math.max(0, row.searches), 0),
    source: ordered.source,
    jobs: list.map((job) => ({ ...job, categoryLabel: categoryLabel(job.categorySlug), searches: popularJobSearches(job.service, searches),
      shown: position.has(job.service),
      homePosition: position.get(job.service) ?? null,
    })),
    missing: [...missing.values()].sort((a, b) => b.searches - a.searches || a.service.localeCompare(b.service, "it")).slice(0, POPULAR_JOBS_MISSING_SHOWN),
  };
}
