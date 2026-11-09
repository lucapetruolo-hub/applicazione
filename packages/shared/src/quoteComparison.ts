/**
 * Confronto dei preventivi fianco a fianco (funzione nuova 8 del controllo
 * pre-lancio dell'08/11/2026, docs/changelog/2026-11-08-confronto-preventivi.md):
 * quali preventivi si confrontano e quale ha il prezzo più basso e la data
 * più vicina. Solo segni su numeri già scritti dai professionisti, mai un
 * consiglio su chi scegliere (CLAUDE.md §5.18).
 */

import { quotePriceTotals } from "./professionals";

/** Da quanti preventivi ancora accettabili compare "Confronta". */
export const QUOTE_COMPARE_MIN = 2;

type ComparableQuote = {
  id: string;
  status: string;
  estimatedStartDate: string;
  items: { priceMinEurCents: number | null; priceMaxEurCents: number | null }[];
};

/** I preventivi che si possono ancora accettare: mandati o con una data proposta dal cliente. */
export function comparableQuotes<T extends ComparableQuote>(quotes: readonly T[]): T[] {
  return quotes.filter((q) => q.status === "SENT" || q.status === "MODIFICATION_REQUESTED");
}

/**
 * Il prezzo più basso (il massimo della forbice più basso, a parità il
 * minimo) e la data più vicina. `null` se tutti sono uguali: un segno su
 * tutti non aiuta a scegliere.
 */
export function quoteComparisonHighlights(quotes: readonly ComparableQuote[]): { cheapestId: string | null; soonestId: string | null } {
  if (quotes.length < QUOTE_COMPARE_MIN) return { cheapestId: null, soonestId: null };
  const priced = quotes
    .map((q) => {
      const totals = quotePriceTotals(q.items);
      // Solo il minimo: "da 80 €" vale 80 anche come massimo.
      const max = totals.totalMaxEurCents > 0 ? totals.totalMaxEurCents : totals.totalMinEurCents;
      return { id: q.id, min: totals.totalMinEurCents > 0 ? totals.totalMinEurCents : max, max };
    })
    .filter((p) => p.max > 0)
    .sort((a, b) => a.max - b.max || a.min - b.min);
  const cheapest = priced[0];
  const cheapestId = cheapest && priced.length === quotes.length && !priced.every((p) => p.max === cheapest.max && p.min === cheapest.min) ? cheapest.id : null;

  const dated = [...quotes].sort((a, b) => a.estimatedStartDate.localeCompare(b.estimatedStartDate));
  const soonest = dated[0]!;
  const soonestId = dated.every((q) => q.estimatedStartDate.slice(0, 10) === soonest.estimatedStartDate.slice(0, 10)) ? null : soonest.id;
  return { cheapestId, soonestId };
}
