import { test } from "node:test";
import assert from "node:assert/strict";
import { clientWithholds, toJobPaymentSummary, withholdingPaymentOffer } from "./onlinePayments";

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

// Carta usata, solo per il cliente (docs/changelog/2026-11-19-entrate-e-uscite.md).
test("il cliente vede la carta, il professionista no", () => {
  const row = job({
    onlineStage: "AWAITING_BALANCE",
    depositEurCents: 2000,
    paidEurCents: 2000,
    savedPaymentMethodId: "pm_1",
    depositCardBrand: "visa",
    depositCardLast4: "4242",
    depositCardWallet: "apple_pay",
  });
  const client = toJobPaymentSummary(row, 10000);
  assert.equal(client?.depositCard, "Apple Pay (Visa •••• 4242)");
  assert.equal(client?.balanceCard, null);
  assert.equal(client?.autoChargeCard, "Apple Pay (Visa •••• 4242)");
  const pro = toJobPaymentSummary(row, 10000, true);
  assert.equal(pro?.depositCard, undefined);
  assert.equal(pro?.autoChargeCard, undefined);
});

test("acconto pagato con la carta salvata: il saldo andrà sulla stessa carta", () => {
  const row = job({ onlineStage: "DEPOSIT_PAID", depositEurCents: 4960, paidEurCents: 4960, savedPaymentMethodId: "pm_1", depositCardBrand: "visa", depositCardLast4: "4242" });
  assert.equal(toJobPaymentSummary(row, null)?.autoChargeCard, "Visa •••• 4242");
  assert.equal(toJobPaymentSummary({ ...row, balanceDirect: true }, null)?.autoChargeCard, null);
});

test("acceptedPaymentForPro: il tipo di pagamento per il professionista, mai la carta", async () => {
  const { acceptedPaymentForPro: raw } = await import("./onlinePayments");
  // Gli importi hanno lo spazio non separabile prima di "€".
  const acceptedPaymentForPro = (...args: Parameters<typeof raw>) => {
    const r = raw(...args);
    return { short: r.short, long: r.long.replace(/\u00a0/g, " ") };
  };
  const one = { totalMinEurCents: 20000, totalMaxEurCents: 20000 };
  const range = { totalMinEurCents: 15000, totalMaxEurCents: 20000 };
  assert.equal(acceptedPaymentForPro("DIRECT", one, 20).short, "Ti paga direttamente");
  assert.deepEqual(acceptedPaymentForPro("ONLINE", one, 20), {
    short: "Paga online con la carta: acconto già pagato",
    long: "Acconto di 40,00 € già pagato online con la carta. Il resto (160,00 €) online con la stessa carta a lavoro finito",
  });
  assert.equal(acceptedPaymentForPro("MIXED", range, 20).long, "Acconto di 30,00 € già pagato online con la carta. Il resto (da 120,00 € a 170,00 €) direttamente a te a lavoro finito");
  assert.equal(acceptedPaymentForPro("ONLINE", one, 100).short, "Ha già pagato tutto online con la carta");
  assert.match(acceptedPaymentForPro("ONLINE", range, 100).long, /^150,00 € già pagati online con la carta, il prezzo minimo/);
});

// Ritenuta del cliente azienda (docs/changelog/2026-11-26-ritenuta-cliente-azienda.md).

test("ritenuta: solo professionista occasionale, fattura a una partita IVA, sostituto d'imposta", () => {
  assert.equal(clientWithholds(true, { kind: "VAT" }), true);
  assert.equal(clientWithholds(true, { kind: "VAT", withholdingAgent: null }), true);
  assert.equal(clientWithholds(true, { kind: "VAT", withholdingAgent: false }), false);
  assert.equal(clientWithholds(true, { kind: "PERSON" }), false);
  assert.equal(clientWithholds(false, { kind: "VAT" }), false);
  assert.equal(clientWithholds(true, null), false);
});

test("ritenuta: tutto online diventa acconto online fino all'80% e saldo di persona", () => {
  assert.deepEqual(withholdingPaymentOffer({ paymentOptions: ["ONLINE", "DIRECT"], depositPercent: 100 }), { paymentOptions: ["MIXED", "DIRECT"], depositPercent: 80 });
  assert.deepEqual(withholdingPaymentOffer({ paymentOptions: ["ONLINE", "MIXED"], depositPercent: 30 }), { paymentOptions: ["MIXED"], depositPercent: 30 });
  assert.deepEqual(withholdingPaymentOffer({ paymentOptions: ["DIRECT"], depositPercent: 20 }), { paymentOptions: ["DIRECT"], depositPercent: 20 });
});
