import { describe, expect, it } from "vitest";
import { acceptedQuoteStats, declaredServiceStats, quoteMidpointEurCents } from "./category-prices";

describe("prezzi delle pagine Quanto costa", () => {
  it("somma le voci del preventivo al centro della fascia", () => {
    expect(
      quoteMidpointEurCents([
        { priceMinEurCents: 5000, priceMaxEurCents: 7000 },
        { priceMinEurCents: 2000, priceMaxEurCents: null },
      ]),
    ).toBe(8000);
    expect(quoteMidpointEurCents([{ priceMinEurCents: null, priceMaxEurCents: null }])).toBeNull();
  });

  it("nessun numero sotto i 10 preventivi accettati", () => {
    const quotes = Array.from({ length: 9 }, (_, i) => ({ totalEurCents: (i + 1) * 1000, updatedAt: new Date("2026-10-01") }));
    expect(acceptedQuoteStats(quotes)).toBeNull();
  });

  it("mediana e quartili dei preventivi accettati", () => {
    const quotes = Array.from({ length: 11 }, (_, i) => ({ totalEurCents: (i + 1) * 1000, updatedAt: new Date(`2026-10-${10 + i}`) }));
    expect(acceptedQuoteStats(quotes)).toEqual({
      count: 11,
      lowEurCents: 3500,
      medianEurCents: 6000,
      highEurCents: 8500,
      updatedAt: new Date("2026-10-20").toISOString(),
    });
  });

  it("prestazioni dichiarate: da 5 professionisti, voci con almeno 2", () => {
    const services = ["a", "b", "c", "d", "e"].map((id) => ({ name: "Sostituzione rubinetto", professionalProfileId: id, priceMinEurCents: 4000, priceMaxEurCents: 8000 }));
    const single = { name: "Rifacimento bagno", professionalProfileId: "a", priceMinEurCents: 500000, priceMaxEurCents: null };
    expect(declaredServiceStats(services.slice(0, 4))).toBeNull();
    expect(declaredServiceStats([...services, single])).toEqual({
      professionalCount: 5,
      services: [{ name: "Sostituzione rubinetto", professionalCount: 5, minEurCents: 4000, maxEurCents: 8000 }],
    });
  });
});
