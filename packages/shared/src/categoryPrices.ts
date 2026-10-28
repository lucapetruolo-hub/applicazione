import type { ServicePriceUnit } from "./professionals";

/**
 * Pagine "Quanto costa un [lavoro]" (`/prezzi/[categoria]`, docs/CHANGELOG.md
 * §296, strategia SEO Latina): prezzi veri del sito, mai stime inventate.
 * La pagina esiste solo da queste soglie in su; sotto, l'API non restituisce
 * numeri (con due o tre preventivi si potrebbe risalire al prezzo di un
 * singolo lavoro) e la pagina non c'è.
 */
export const MIN_ACCEPTED_QUOTES_FOR_PRICES = 10;
export const MIN_PROFESSIONALS_FOR_DECLARED_PRICES = 5;

export type CategoryPriceStats = {
  categorySlug: string;
  /** Sigla della provincia quando i prezzi sono di una zona (`?city=`), null per tutta Italia. */
  province: string | null;
  /** Preventivi accettati dai clienti, null sotto `MIN_ACCEPTED_QUOTES_FOR_PRICES`. */
  quotes: {
    count: number;
    /** Metà dei preventivi sta tra `lowEurCents` e `highEurCents` (1° e 3° quartile). */
    lowEurCents: number;
    medianEurCents: number;
    highEurCents: number;
    /** Data dell'ultimo preventivo accettato considerato (ISO). */
    updatedAt: string;
  } | null;
  /** Prezzi delle prestazioni dichiarati dai professionisti, null sotto `MIN_PROFESSIONALS_FOR_DECLARED_PRICES`. */
  declared: {
    professionalCount: number;
    /** `unit`: l'unità più usata dai professionisti della voce; i prezzi contano solo quelli con quell'unità (§398). */
    services: { name: string; professionalCount: number; minEurCents: number; maxEurCents: number; unit: ServicePriceUnit }[];
  } | null;
};

/** La pagina "Quanto costa" ha qualcosa di vero da mostrare? */
export function hasCategoryPrices(stats: CategoryPriceStats | null | undefined): boolean {
  return !!stats && (stats.quotes !== null || stats.declared !== null);
}

/**
 * "Quanto costa in media" della home (docs/CHANGELOG.md §398): le cifre di
 * una voce compaiono solo da questi professionisti con un prezzo in su. Con
 * uno o due si leggerebbe il prezzo di un singolo professionista, e la
 * mediana di due numeri non dice niente.
 */
export const MIN_PROFESSIONALS_FOR_SERVICE_PRICE = 3;

/** Una voce del "Quanto costa in media": chi la offre e, se bastano, i prezzi. */
export type ServicePriceIndexEntry = {
  name: string;
  /** Professionisti visibili in ricerca che offrono la voce: sono quelli che apre il clic. */
  professionalCount: number;
  /**
   * Prezzo di ogni professionista = centro della sua fascia. Metà dei
   * professionisti sta tra `lowEurCents` e `highEurCents` (1° e 3° quartile).
   * Null sotto `MIN_PROFESSIONALS_FOR_SERVICE_PRICE` professionisti con un prezzo.
   */
  price: { pricedCount: number; lowEurCents: number; medianEurCents: number; highEurCents: number; unit: ServicePriceUnit } | null;
};
