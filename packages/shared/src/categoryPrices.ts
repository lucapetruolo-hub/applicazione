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
    services: { name: string; professionalCount: number; minEurCents: number; maxEurCents: number }[];
  } | null;
};

/** La pagina "Quanto costa" ha qualcosa di vero da mostrare? */
export function hasCategoryPrices(stats: CategoryPriceStats | null | undefined): boolean {
  return !!stats && (stats.quotes !== null || stats.declared !== null);
}
