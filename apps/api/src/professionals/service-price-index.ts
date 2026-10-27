import { MIN_PROFESSIONALS_FOR_SERVICE_PRICE, type ServicePriceIndexEntry } from "@professionisti/shared";
import { quantile } from "./category-prices";
import { serviceGroupKey } from "./service-group-key";

/** Cifre in euro tondi: i centesimi di una mediana sono rumore. */
const toEuro = (cents: number) => Math.round(cents / 100) * 100;

type OfferedService = { name: string; professionalProfileId: string; priceMinEurCents: number | null; priceMaxEurCents: number | null };

/**
 * Voci del "Quanto costa in media" (§383): ogni prestazione offerta dai
 * professionisti visibili, con quanti la offrono e, da
 * `MIN_PROFESSIONALS_FOR_SERVICE_PRICE` professionisti con un prezzo in su,
 * mediana e intervallo tipico al posto di minimo e massimo (un solo prezzo
 * strano allargava la forbice).
 */
export function buildServicePriceIndex(services: OfferedService[]): ServicePriceIndexEntry[] {
  const groups = new Map<string, { name: string; professionals: Set<string>; priceByProfessional: Map<string, number> }>();
  for (const service of services) {
    const key = serviceGroupKey(service.name);
    if (!key) continue;
    let group = groups.get(key);
    if (!group) {
      group = { name: service.name.trim(), professionals: new Set(), priceByProfessional: new Map() };
      groups.set(key, group);
    }
    group.professionals.add(service.professionalProfileId);
    const low = service.priceMinEurCents ?? service.priceMaxEurCents;
    const high = service.priceMaxEurCents ?? service.priceMinEurCents;
    // Il prezzo di un professionista è il centro della sua fascia; se scrive
    // due volte la stessa voce conta una volta sola.
    if (low !== null && high !== null && !group.priceByProfessional.has(service.professionalProfileId)) {
      group.priceByProfessional.set(service.professionalProfileId, (low + high) / 2);
    }
  }

  return [...groups.values()]
    .map((group) => {
      const prices = [...group.priceByProfessional.values()].sort((a, b) => a - b);
      return {
        name: group.name,
        professionalCount: group.professionals.size,
        price:
          prices.length >= MIN_PROFESSIONALS_FOR_SERVICE_PRICE
            ? { pricedCount: prices.length, lowEurCents: toEuro(quantile(prices, 0.25)), medianEurCents: toEuro(quantile(prices, 0.5)), highEurCents: toEuro(quantile(prices, 0.75)) }
            : null,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "it"));
}
