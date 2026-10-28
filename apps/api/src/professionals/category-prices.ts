import {
  canonicalServiceName,
  MIN_ACCEPTED_QUOTES_FOR_PRICES,
  MIN_PROFESSIONALS_FOR_DECLARED_PRICES,
  SERVICE_PRICE_UNITS,
  type CategoryPriceStats,
  type ServicePriceUnit,
} from "@professionisti/shared";
import { type ServiceCanonicalizer, serviceGroupKey } from "./service-group-key";

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
 * Unità più usata tra i prezzi della voce (a pari merito vince l'ordine di
 * `SERVICE_PRICE_UNITS`, "a lavoro" per primo): 10 € al m² e 1.500 € a
 * lavoro non si mettono nella stessa mediana (§398).
 */
export function dominantPriceUnit(units: ServicePriceUnit[]): ServicePriceUnit {
  const counts = new Map<ServicePriceUnit, number>();
  for (const unit of units) counts.set(unit, (counts.get(unit) ?? 0) + 1);
  return SERVICE_PRICE_UNITS.reduce((best, unit) => ((counts.get(unit) ?? 0) > (counts.get(best) ?? 0) ? unit : best), SERVICE_PRICE_UNITS[0]);
}

/**
 * Prestazioni dichiarate, raggruppate per nome (come il "Quanto costa in
 * media" della home), con almeno 2 professionisti per voce: una voce di uno
 * solo direbbe il suo prezzo, non quello della zona. Null sotto la soglia di
 * professionisti con prezzi.
 */
export function declaredServiceStats(
  services: (PriceRange & { name: string; professionalProfileId: string; priceUnit: ServicePriceUnit })[],
  canonicalize: ServiceCanonicalizer = canonicalServiceName,
): CategoryPriceStats["declared"] {
  const professionals = new Set<string>();
  const groups = new Map<string, { name: string; rows: { professionalProfileId: string; low: number; high: number; unit: ServicePriceUnit }[] }>();
  for (const service of services) {
    const low = service.priceMinEurCents ?? service.priceMaxEurCents;
    const high = service.priceMaxEurCents ?? service.priceMinEurCents;
    const key = serviceGroupKey(service.name, canonicalize);
    if (low === null || high === null || !key) continue;
    professionals.add(service.professionalProfileId);
    const group = groups.get(key) ?? { name: canonicalize(service.name).trim(), rows: [] };
    group.rows.push({ professionalProfileId: service.professionalProfileId, low, high, unit: service.priceUnit });
    groups.set(key, group);
  }
  if (professionals.size < MIN_PROFESSIONALS_FOR_DECLARED_PRICES) return null;
  return {
    professionalCount: professionals.size,
    services: [...groups.values()]
      .flatMap((group) => {
        // Solo i prezzi con l'unità più usata nella voce (§398): "8 € al m²"
        // e "1.500 € a lavoro" non stanno nella stessa forbice.
        const unit = dominantPriceUnit(group.rows.map((row) => row.unit));
        const rows = group.rows.filter((row) => row.unit === unit);
        const professionalCount = new Set(rows.map((row) => row.professionalProfileId)).size;
        if (professionalCount < 2) return [];
        return [
          {
            name: group.name,
            professionalCount,
            minEurCents: Math.min(...rows.map((row) => row.low)),
            maxEurCents: Math.max(...rows.map((row) => row.high)),
            unit,
          },
        ];
      })
      .sort((a, b) => b.professionalCount - a.professionalCount || a.name.localeCompare(b.name, "it"))
      .slice(0, 12),
  };
}
