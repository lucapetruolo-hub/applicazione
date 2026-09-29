import { describe, expect, it } from "vitest";
import { completionDeviation } from "@professionisti/shared";

const quote = [
  { name: "Manodopera", priceMinEurCents: 5000, priceMaxEurCents: 8000 },
  { name: "Materiali", priceMinEurCents: 2000, priceMaxEurCents: 3000 },
];

describe("differenze tra preventivo e importo finale (§163)", () => {
  it("dentro la fascia e stesse voci: nessun motivo richiesto", () => {
    const d = completionDeviation(quote, [
      { name: "Manodopera", priceEurCents: 7000 },
      { name: " materiali ", priceEurCents: 2500 },
    ]);
    expect(d?.needsReason).toBe(false);
    expect(d?.quoteMinEurCents).toBe(7000);
    expect(d?.quoteMaxEurCents).toBe(11000);
  });
  it("totale sopra o sotto la fascia: motivo richiesto", () => {
    expect(completionDeviation(quote, [{ name: "Manodopera", priceEurCents: 12000 }])?.direction).toBe("ABOVE");
    expect(completionDeviation(quote, [{ name: "Manodopera", priceEurCents: 3000 }])?.direction).toBe("BELOW");
  });
  it("voce aggiunta anche con totale nella fascia: motivo richiesto", () => {
    const d = completionDeviation(quote, [
      { name: "Manodopera", priceEurCents: 5000 },
      { name: "Materiali", priceEurCents: 2000 },
      { name: "Trasporto", priceEurCents: 1000 },
    ]);
    expect(d?.addedItemNames).toEqual(["Trasporto"]);
    expect(d?.direction).toBeNull();
    expect(d?.needsReason).toBe(true);
  });
  it("voce 'su richiesta' nel preventivo: nessun tetto massimo", () => {
    const d = completionDeviation([{ name: "Sopralluogo", priceMinEurCents: null, priceMaxEurCents: null }], [{ name: "Sopralluogo", priceEurCents: 9000 }]);
    expect(d?.quoteMaxEurCents).toBeNull();
    expect(d?.needsReason).toBe(false);
  });
  it("senza preventivo (prenotazione dall'agenda): niente da confrontare", () => {
    expect(completionDeviation([], [{ name: "Intervento", priceEurCents: 5000 }])).toBeNull();
  });
});
