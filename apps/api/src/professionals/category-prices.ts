import {
  MIN_ACCEPTED_QUOTES_FOR_PRICES,
  MIN_PROFESSIONALS_FOR_DECLARED_PRICES,
  type CategoryPriceStats,
} from "@professionisti/shared";
import { serviceGroupKey } from "./service-group-key";

type PriceRange = { priceMinEurCents: number | null; priceMaxEurCents: number | null };

/**
 * Prezzo di un preventivo per le pagine "Quanto costa" (docs/CHANGELOG.md
 * §296): somma delle voci, ognuna al centro della sua fascia (una voce con un
 * solo prezzo vale quello). Null se nessuna voce ha un prezzo.
 */
export function quoteMidpointEurCents(items: PriceRange[]): number | null {
  let total = 0;
  let priced = false;
  for (const item of items) {
    const low = item.priceMinEurCents ?? item.priceMaxEurCents;
    const high = item.priceMaxEurCents ?? item.priceMinEurCents;
    if (low === null || high === null) continue;
    total += (low + high) / 2;
    priced = true;
  }
  return priced ? Math.round(total) : null;
}

/** Quantile con interpolazione lineare su valori già ordinati. */
export function quantile(sorted: number[], q: number): number {
  const position = (sorted.length - 1) * q;
  const low = sorted[Math.floor(position)] ?? 0;
  const high = sorted[Math.ceil(position)] ?? low;
  return Math.round(low + (high - low) * (position - Math.floor(position)));
}

/** Statistiche dei preventivi accettati, null sotto la soglia. */
export function acceptedQuoteStats(quotes: { totalEurCents: number; updatedAt: Date }[]): CategoryPriceStats["quotes"] {
  if (quotes.length < MIN_ACCEPTED_QUOTES_FOR_PRICES) return null;
  const sorted = quotes.map((quote) => quote.totalEurCents).sort((a, b) => a - b);
  const updatedAt = new Date(Math.max(...quotes.map((quote) => quote.updatedAt.getTime())));
  return {
    count: sorted.length,
    lowEurCents: quantile(sorted, 0.25),
    medianEurCents: quantile(sorted, 0.5),
    highEurCents: quantile(sorted, 0.75),
    updatedAt: updatedAt.toISOString(),
  };
}

/**
 * Prestazioni dichiarate, raggruppate per nome (come il "Quanto costa in
 * media" della home), con almeno 2 professionisti per voce: una voce di uno
 * solo direbbe il suo prezzo, non quello della zona. Null sotto la soglia di
 * professionisti con prezzi.
 */
export function declaredServiceStats(services: (PriceRange & { name: string; professionalProfileId: string })[]): CategoryPriceStats["declared"] {
  const professionals = new Set<string>();
  const groups = new Map<string, { name: string; professionals: Set<string>; minEurCents: number; maxEurCents: number }>();
  for (const service of services) {
    const low = service.priceMinEurCents ?? service.priceMaxEurCents;
    const high = service.priceMaxEurCents ?? service.priceMinEurCents;
    const key = serviceGroupKey(service.name);
    if (low === null || high === null || !key) continue;
    professionals.add(service.professionalProfileId);
    const group = groups.get(key);
    if (group) {
      group.professionals.add(service.professionalProfileId);
      group.minEurCents = Math.min(group.minEurCents, low);
      group.maxEurCents = Math.max(group.maxEurCents, high);
    } else {
      groups.set(key, { name: service.name.trim(), professionals: new Set([service.professionalProfileId]), minEurCents: low, maxEurCents: high });
    }
  }
  if (professionals.size < MIN_PROFESSIONALS_FOR_DECLARED_PRICES) return null;
  return {
    professionalCount: professionals.size,
    services: [...groups.values()]
      .filter((group) => group.professionals.size >= 2)
      .map((group) => ({ name: group.name, professionalCount: group.professionals.size, minEurCents: group.minEurCents, maxEurCents: group.maxEurCents }))
      .sort((a, b) => b.professionalCount - a.professionalCount || a.name.localeCompare(b.name, "it"))
      .slice(0, 12),
  };
}
