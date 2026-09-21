import { describe, expect, it } from "vitest";
import { PlatformFeeRulesService } from "./platform-fee-rules.service";

/**
 * `computeFee` è la funzione che calcola quanto trattiene Manovia su ogni
 * pagamento intermediato (Stripe Connect, job-payments.service.ts) — un
 * errore qui è un errore di soldi reali su ogni transazione, il tipo di
 * regressione silenziosa che l'audit tecnico (CEO, checklist "zero test
 * automatici") ha segnalato come rischio concreto senza copertura. Nessun
 * mock necessario: la funzione è pura (nessuna dipendenza Prisma), quindi
 * istanziamo il service passando `null` al posto del client Prisma — mai
 * usato da questo metodo.
 */
const service = new PlatformFeeRulesService(null as never);

describe("PlatformFeeRulesService.computeFee", () => {
  it("nessuna regola applicabile → commissione zero", () => {
    expect(service.computeFee(10_000, null)).toBe(0);
  });

  it("applica la sola percentuale quando non c'è quota fissa né limiti", () => {
    // 10% di 10.000 centesimi (100€) = 1.000 centesimi (10€)
    const rule = { percentageBasisPoints: 1000, fixedFeeEurCents: 0, minFeeEurCents: null, maxFeeEurCents: null };
    expect(service.computeFee(10_000, rule)).toBe(1_000);
  });

  it("somma la quota fissa alla percentuale", () => {
    // 10% di 10.000 = 1.000, + 50 centesimi fissi = 1.050
    const rule = { percentageBasisPoints: 1000, fixedFeeEurCents: 50, minFeeEurCents: null, maxFeeEurCents: null };
    expect(service.computeFee(10_000, rule)).toBe(1_050);
  });

  it("arrotonda all'intero più vicino (nessun centesimo frazionario)", () => {
    // 10% di 12.345 = 1.234,5 → arrotondato a 1.235 (Math.round)
    const rule = { percentageBasisPoints: 1000, fixedFeeEurCents: 0, minFeeEurCents: null, maxFeeEurCents: null };
    expect(service.computeFee(12_345, rule)).toBe(1_235);
  });

  it("applica la commissione minima quando il calcolo scende sotto la soglia", () => {
    // 5% di 1.000 = 50, ma il minimo è 200 → vince il minimo
    const rule = { percentageBasisPoints: 500, fixedFeeEurCents: 0, minFeeEurCents: 200, maxFeeEurCents: null };
    expect(service.computeFee(1_000, rule)).toBe(200);
  });

  it("applica il tetto massimo quando il calcolo supera la soglia", () => {
    // 10% di 1.000.000 = 100.000, ma il massimo è 5.000 → vince il massimo
    const rule = { percentageBasisPoints: 1000, fixedFeeEurCents: 0, minFeeEurCents: null, maxFeeEurCents: 5_000 };
    expect(service.computeFee(1_000_000, rule)).toBe(5_000);
  });

  it("non permette mai una commissione negativa, anche con quota fissa negativa da dati corrotti", () => {
    const rule = { percentageBasisPoints: 0, fixedFeeEurCents: -500, minFeeEurCents: null, maxFeeEurCents: null };
    expect(service.computeFee(1_000, rule)).toBe(0);
  });

  it("non permette mai una commissione superiore all'importo lordo del pagamento", () => {
    // 100% + una quota fissa enorme non deve mai far pagare al professionista più di quanto ha incassato
    const rule = { percentageBasisPoints: 10_000, fixedFeeEurCents: 999_999, minFeeEurCents: null, maxFeeEurCents: null };
    expect(service.computeFee(10_000, rule)).toBe(10_000);
  });

  it("importo lordo zero → commissione zero, nessuna divisione che esplode", () => {
    const rule = { percentageBasisPoints: 1000, fixedFeeEurCents: 0, minFeeEurCents: null, maxFeeEurCents: null };
    expect(service.computeFee(0, rule)).toBe(0);
  });
});
