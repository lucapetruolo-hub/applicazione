import { describe, expect, it } from "vitest";
import type { ServicePriceUnit } from "@professionisti/shared";
import { buildServicePriceIndex } from "./service-price-index";

const offer = (professionalProfileId: string, name: string, min: number | null, max: number | null = min, priceUnit: ServicePriceUnit = "JOB") => ({
  professionalProfileId,
  name,
  priceMinEurCents: min,
  priceMaxEurCents: max,
  priceUnit,
});

describe("voci del \"Quanto costa in media\" (§383)", () => {
  it("unisce maiuscole e spazi e conta i professionisti, non le righe", () => {
    const [entry] = buildServicePriceIndex([offer("p1", "Tinteggiatura", 800), offer("p1", " tinteggiatura ", 900), offer("p2", "TINTEGGIATURA", null)]);
    expect(entry).toMatchObject({ name: "Tinteggiatura", professionalCount: 2, price: null });
  });

  it("niente cifre sotto i 3 professionisti con un prezzo", () => {
    const [entry] = buildServicePriceIndex([offer("p1", "Trasloco", 40000), offer("p2", "Trasloco", 90000), offer("p3", "Trasloco", null)]);
    expect(entry).toMatchObject({ professionalCount: 3, price: null });
  });

  it("mediana e intervallo tipico: un prezzo strano non allarga la forbice", () => {
    const entries = buildServicePriceIndex([
      offer("p1", "Caldaia", 150000, 170000),
      offer("p2", "Caldaia", 180000),
      offer("p3", "Caldaia", 200000),
      offer("p4", "Caldaia", 220000),
      offer("p5", "Caldaia", 9000),
    ]);
    expect(entries[0]!.price).toEqual({ pricedCount: 5, lowEurCents: 160000, medianEurCents: 180000, highEurCents: 200000, unit: "JOB" });
  });

  it("prezzi con unità diverse: conta solo l'unità più usata", () => {
    const [entry] = buildServicePriceIndex([
      offer("p1", "Tinteggiatura", 800, 800, "SQUARE_METER"),
      offer("p2", "Tinteggiatura", 1000, 1000, "SQUARE_METER"),
      offer("p3", "Tinteggiatura", 1200, 1200, "SQUARE_METER"),
      offer("p4", "Tinteggiatura", 150000),
    ]);
    expect(entry).toMatchObject({ professionalCount: 4, price: { pricedCount: 3, medianEurCents: 1000, unit: "SQUARE_METER" } });
  });
});
