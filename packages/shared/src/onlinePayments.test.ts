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

test("depositPreviewLine: percentuale sul minimo, al centesimo", async () => {
  const { depositPreviewLine } = await import("./onlinePayments");
  assert.equal(depositPreviewLine({ totalMinEurCents: 15000, totalMaxEurCents: 25000 }, 20)?.text, "Il cliente paga subito 30,00 € con la carta (20% di 150 €, il prezzo minimo).");
  assert.equal(depositPreviewLine({ totalMinEurCents: 15500, totalMaxEurCents: 15500 }, 33)?.text, "Il cliente paga subito 51,15 € con la carta (33% di 155 €).");
  assert.equal(depositPreviewLine({ totalMinEurCents: 8000, totalMaxEurCents: 8000 }, 30, { perVisit: true })?.text, "Il cliente paga subito 24,00 € a visita con la carta (30% di 80 €).");
});

test("depositPreviewLine: 100% con forbice = minimo; casi limite", async () => {
  const { depositPreviewLine } = await import("./onlinePayments");
  assert.match(depositPreviewLine({ totalMinEurCents: 15000, totalMaxEurCents: 25000 }, 100)!.text, /150,00 € con la carta, il prezzo minimo/);
  assert.match(depositPreviewLine({ totalMinEurCents: 20000, totalMaxEurCents: 20000 }, 100)!.text, /tutto con la carta: 200,00/);
  assert.match(depositPreviewLine({ totalMinEurCents: 0, totalMaxEurCents: 0 }, 20)!.text, /Scrivi i prezzi/);
  assert.equal(depositPreviewLine({ totalMinEurCents: 200, totalMaxEurCents: 200 }, 10)?.tooLow, true);
  assert.equal(depositPreviewLine({ totalMinEurCents: 10000, totalMaxEurCents: 10000 }, 0), null);
  assert.equal(depositPreviewLine({ totalMinEurCents: 10000, totalMaxEurCents: 10000 }, 12.5), null);
});
