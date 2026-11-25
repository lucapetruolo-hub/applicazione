import { describe, expect, it } from "vitest";
import { ESTIMATED_MONTHLY_COSTS, marginPerPaying, payingNeededFor, saveMonthlyCostsSchema, saveProfitTargetSchema } from "@professionisti/shared";
import { connectCostEurCents, monthRange, monthlyPriceEurCents, selectableMonths, subscriptionStripeCostEurCents } from "./monthly-accounts";

describe("Conti del mese (docs/changelog/2026-11-25-conti-del-mese.md)", () => {
  it("abbonati che servono: stesso risultato dell'analisi del 25/11 (48 nello scenario medio)", () => {
    const fixed = ESTIMATED_MONTHLY_COSTS.reduce((sum, line) => sum + line.monthlyEurCents, 0);
    expect(Math.round((fixed * 12) / 100)).toBe(10878);
    // Margine medio 42,33 € meno 2,03 € per rimpiazzare chi se ne va.
    expect(payingNeededFor(1_200_000, fixed, 4030)).toBe(48);
    expect(payingNeededFor(1_200_000, fixed, 0)).toBeNull();
  });

  it("margine per abbonato: dati veri se ci sono, altrimenti la stima", () => {
    expect(marginPerPaying({ paying: 0, revenueEurCents: 0, variableCostsEurCents: 0 })).toEqual({ eurCents: 4233, estimated: true });
    expect(marginPerPaying({ paying: 10, revenueEurCents: 50_000, variableCostsEurCents: 5_000 })).toEqual({ eurCents: 4500, estimated: false });
  });

  it("prezzo al mese: l'annuale diviso 12", () => {
    expect(monthlyPriceEurCents("PLUS", "MONTH")).toBe(5900);
    expect(monthlyPriceEurCents("PLUS", "YEAR")).toBe(Math.round(59000 / 12));
  });

  it("stime di Stripe", () => {
    // Base con l'IVA: 23,18 € → 2,2% + 0,25 €.
    expect(subscriptionStripeCostEurCents(2318)).toBe(51 + 25);
    expect(subscriptionStripeCostEurCents(0)).toBe(0);
    // Due professionisti pagati, tre bonifici da 100 €.
    expect(connectCostEurCents(2, [10_000, 10_000, 10_000])).toBe(400 + 3 * (25 + 10));
  });

  it("mesi: ultimi 12, mai prima del mese del lancio", () => {
    const now = new Date("2027-03-10T10:00:00Z");
    expect(selectableMonths(now, null)).toHaveLength(12);
    // Lancio: mezzanotte di Roma del 1° gennaio = sera del 31/12 in UTC.
    expect(selectableMonths(now, new Date("2026-12-31T23:00:00Z"))).toEqual(["2027-03", "2027-02", "2027-01"]);
    expect(monthRange("2027-02")).toEqual({ from: new Date("2027-02-01T00:00:00Z"), to: new Date("2027-03-01T00:00:00Z") });
  });

  it("voci dei costi: nome obbligatorio, cifre intere e non negative", () => {
    expect(saveMonthlyCostsSchema.safeParse({ lines: [{ label: "Hosting", monthlyEurCents: 6000 }] }).success).toBe(true);
    expect(saveMonthlyCostsSchema.safeParse({ lines: [{ label: " ", monthlyEurCents: 6000 }] }).success).toBe(false);
    expect(saveMonthlyCostsSchema.safeParse({ lines: [{ label: "Hosting", monthlyEurCents: -1 }] }).success).toBe(false);
  });
});

describe("traguardo di utile scritto dall'admin", () => {
  it("da 1.000 € in su, in centesimi interi", () => {
    expect(saveProfitTargetSchema.safeParse({ yearEurCents: 2_000_000 }).success).toBe(true);
    expect(saveProfitTargetSchema.safeParse({ yearEurCents: 50_000 }).success).toBe(false);
    expect(saveProfitTargetSchema.safeParse({ yearEurCents: 1_200_000.5 }).success).toBe(false);
  });
});
