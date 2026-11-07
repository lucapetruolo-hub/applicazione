import { POPULAR_SERVICES, type ProfessionalCategorySlug } from "./categories";

/** Un lavoro della sezione "Lavori più cercati" in home: nome dell'elenco suggerito e il suo mestiere. */
export type PopularJob = { service: string; categorySlug: ProfessionalCategorySlug };

export type PopularJobsResponse = {
  jobs: PopularJob[];
  /** "searches": l'ordine viene dalle ricerche sul sito; "default": elenco di partenza. */
  source: "searches" | "default";
};

/** Quanti lavori in home: due righe su computer, una manciata da telefono. */
export const POPULAR_JOBS_COUNT = 8;

/**
 * Sotto questa soglia di ricerche (ultimi 90 giorni, dal lancio) l'ordine
 * delle ricerche non dice ancora nulla: si usa l'elenco di partenza.
 */
export const POPULAR_JOBS_MIN_SEARCHES = 50;

/**
 * Elenco di partenza, finché il sito non ha ricerche sufficienti: i lavori più
 * cercati su Google (Keyword Planner del 06/11/2026) e nelle 769 frasi dei
 * clienti (docs/CHANGELOG.md §392). Ogni nome è nell'elenco suggerito del suo
 * mestiere (`POPULAR_SERVICES`), così la ricerca trova chi lo offre.
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

const isListed = (job: PopularJob) => (POPULAR_SERVICES[job.categorySlug] ?? []).includes(job.service);

/**
 * I lavori da mostrare: prima i più cercati sul sito (se le ricerche bastano),
 * poi l'elenco di partenza fino a POPULAR_JOBS_COUNT, così la sezione non resta
 * mai mezza vuota. Lo stesso nome compare una volta sola, anche se è in due mestieri.
 */
export function orderPopularJobs(searches: { categorySlug: string; service: string; searches: number }[]): PopularJobsResponse {
  const total = searches.reduce((sum, row) => sum + Math.max(0, row.searches), 0);
  const fromSearches =
    total >= POPULAR_JOBS_MIN_SEARCHES
      ? [...searches]
          .filter((row) => row.searches > 0)
          .sort((a, b) => b.searches - a.searches || a.service.localeCompare(b.service, "it"))
          .map((row) => ({ service: row.service, categorySlug: row.categorySlug as ProfessionalCategorySlug }))
          .filter(isListed)
      : [];
  const seen = new Set<string>();
  const jobs: PopularJob[] = [];
  for (const job of [...fromSearches, ...DEFAULT_POPULAR_JOBS]) {
    const key = job.service.toLocaleLowerCase("it");
    if (seen.has(key)) continue;
    seen.add(key);
    jobs.push(job);
    if (jobs.length >= POPULAR_JOBS_COUNT) break;
  }
  return { jobs, source: fromSearches.length > 0 ? "searches" : "default" };
}
