import { test } from "node:test";
import assert from "node:assert/strict";
import { toJobPaymentSummary } from "./onlinePayments";

/** Lavoro di 120 € pagato tutto online, chiuso, non ancora sbloccato. */
function job(overrides: Record<string, unknown> = {}) {
  return {
    paymentMethod: "MANOVIA",
    balanceDirect: false,
    onlineStage: "PAID",
    depositEurCents: 12000,
    paidEurCents: 12000,
    refundedEurCents: 0,
    platformFeeEurCents: 1025,
    stripeFeeEurCents: 0,
    netAmountEurCents: 0,
    releaseDueAt: null,
    releasedAt: null,
    balanceUnpaidAt: null,
    ...overrides,
  } as Parameters<typeof toJobPaymentSummary>[0];
}

// Rimborso concordato di 30 € dopo una segnalazione: prima il cliente si vedeva
// chiedere "Paga il saldo (30,00 €)" (docs/changelog/2026-11-05-pagamenti-di-prova.md).
test("un rimborso concordato non riapre il saldo da pagare", () => {
  assert.equal(toJobPaymentSummary(job({ refundedEurCents: 3000 }), 12000)?.balanceDueEurCents, 0);
});

test("il saldo vero resta: acconto 20 € su un lavoro di 100 €", () => {
  assert.equal(toJobPaymentSummary(job({ depositEurCents: 2000, paidEurCents: 2000, onlineStage: "AWAITING_BALANCE" }), 10000)?.balanceDueEurCents, 8000);
});

test("un rimborso prima della chiusura abbassa il prezzo, non si ripaga a fine lavoro", () => {
  // Acconto 20 €, 10 € rimborsati, lavoro chiuso a 100 €: restano 80 €, il cliente paga 90 € in tutto.
  assert.equal(toJobPaymentSummary(job({ depositEurCents: 2000, paidEurCents: 2000, refundedEurCents: 1000, onlineStage: "AWAITING_BALANCE" }), 10000)?.balanceDueEurCents, 8000);
});
