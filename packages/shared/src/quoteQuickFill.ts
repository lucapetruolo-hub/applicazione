/**
 * Preventivo in 30 secondi (funzione nuova 4 del controllo pre-lancio
 * dell'08/11/2026, docs/changelog/2026-11-08-preventivo-in-30-secondi.md):
 * nel modulo del preventivo il professionista aggiunge una voce con un tocco
 * dalle prestazioni del suo profilo, oppure riparte dall'ultimo preventivo
 * mandato per lo stesso mestiere. Il prezzo resta sempre suo e modificabile
 * (CLAUDE.md §5.18): qui si copia solo quello che ha già scritto lui.
 */

import { PROFESSIONAL_CATEGORIES } from "./categories";
import type { ProfessionalLead } from "./dashboard";
import { serviceMatchingProblem } from "./problemMatch";
import type { ServicePriceUnit } from "./professionals";

export type QuickQuoteService = {
  id: string;
  name: string;
  priceMinEurCents: number | null;
  priceMaxEurCents: number | null;
  priceUnit: ServicePriceUnit;
  categorySlug?: string | null;
};

/** Quante prestazioni mostrare come scorciatoie: oltre, il modulo diventa lungo da telefono. */
export const QUICK_QUOTE_SERVICES_SHOWN = 8;

/**
 * Le prestazioni da proporre come voci pronte, nell'ordine: quella che
 * corrisponde alla descrizione del cliente (`suggested`), poi quelle del
 * mestiere della richiesta, poi le altre.
 */
export function quickQuoteServices<T extends QuickQuoteService>(
  services: readonly T[],
  request: { categoryLabel: string; description: string },
): { service: T; suggested: boolean }[] {
  const slug = PROFESSIONAL_CATEGORIES.find((c) => c.label === request.categoryLabel)?.slug;
  const match = serviceMatchingProblem(services, request.description);
  const rank = (s: T) => (s === match ? 0 : slug && s.categorySlug === slug ? 1 : 2);
  return services
    .map((service, index) => ({ service, index }))
    .sort((a, b) => rank(a.service) - rank(b.service) || a.index - b.index)
    .slice(0, QUICK_QUOTE_SERVICES_SHOWN)
    .map(({ service }) => ({ service, suggested: service === match }));
}

/**
 * La voce del preventivo che nasce da una prestazione. Il prezzo si copia
 * solo se è "a lavoro": "8–15 € al m²" non è il totale di un lavoro, lì il
 * professionista scrive la cifra (il campo resta vuoto).
 */
export function quoteItemFromService(service: QuickQuoteService): { name: string; priceMinEurCents: number | null; priceMaxEurCents: number | null } {
  if (service.priceUnit !== "JOB") return { name: service.name, priceMinEurCents: null, priceMaxEurCents: null };
  return { name: service.name, priceMinEurCents: service.priceMinEurCents, priceMaxEurCents: service.priceMaxEurCents };
}

export type SimilarQuote = {
  guidedRequestId: string;
  description: string;
  sentAt: string;
  items: { name: string; priceMinEurCents: number | null; priceMaxEurCents: number | null }[];
  notes: string | null;
};

/**
 * L'ultimo preventivo mandato dal professionista per lo stesso mestiere, su
 * un'altra richiesta: da usare come modello. Anche se poi è stato
 * rifiutato o ritirato, perché le voci e i prezzi restano i suoi.
 */
export function lastSimilarQuote(leads: readonly ProfessionalLead[], current: ProfessionalLead): SimilarQuote | null {
  let best: SimilarQuote | null = null;
  for (const lead of leads) {
    if (lead.guidedRequest.id === current.guidedRequest.id) continue;
    if (lead.guidedRequest.categoryLabel !== current.guidedRequest.categoryLabel) continue;
    const quote = lead.quote;
    if (!quote || quote.items.length === 0) continue;
    if (best && quote.sentAt <= best.sentAt) continue;
    best = {
      guidedRequestId: lead.guidedRequest.id,
      description: lead.guidedRequest.description,
      sentAt: quote.sentAt,
      items: quote.items.map((it) => ({ name: it.name, priceMinEurCents: it.priceMinEurCents, priceMaxEurCents: it.priceMaxEurCents })),
      notes: quote.notes,
    };
  }
  return best;
}

/**
 * Prezzo della "Manodopera" dell'ultimo preventivo mandato (qualsiasi
 * mestiere), per aprire il modulo con quella riga già compilata: il
 * professionista di solito chiede la stessa cifra. `null` se non l'ha mai
 * scritta con un prezzo.
 */
export function lastLaborPrice(leads: readonly ProfessionalLead[]): { priceMinEurCents: number | null; priceMaxEurCents: number | null } | null {
  let best: { sentAt: string; priceMinEurCents: number | null; priceMaxEurCents: number | null } | null = null;
  for (const lead of leads) {
    const quote = lead.quote;
    if (!quote || (best && quote.sentAt <= best.sentAt)) continue;
    const labor = quote.items.find((it) => it.name.trim().toLowerCase() === "manodopera" && (it.priceMinEurCents != null || it.priceMaxEurCents != null));
    if (labor) best = { sentAt: quote.sentAt, priceMinEurCents: labor.priceMinEurCents, priceMaxEurCents: labor.priceMaxEurCents };
  }
  return best ? { priceMinEurCents: best.priceMinEurCents, priceMaxEurCents: best.priceMaxEurCents } : null;
}
