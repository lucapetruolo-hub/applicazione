import { test } from "node:test";
import assert from "node:assert/strict";
import { quotePaymentSplit, quotePaymentSplitLine } from "./onlinePayments";

// Cifre di ora e di dopo nella scheda del preventivo e nel PDF
// (docs/changelog/2026-11-05-scheda-preventivo-semplice.md).
const fifty = { totalMinEurCents: 5000, totalMaxEurCents: 5000 };

test("acconto online del 20% su 50 €: 10 € ora, 40 € a lavoro finito", () => {
  assert.deepEqual(quotePaymentSplit("ONLINE", fifty, 20), { nowEurCents: 1000, restMaxEurCents: 4000, restIsRange: false, restOnline: true });
  assert.equal(quotePaymentSplitLine("ONLINE", fifty, 20, true), "10,00 € ora online, 40,00 € a lavoro finito");
});

test("saldo diretto: il resto al professionista", () => {
  assert.equal(quotePaymentSplitLine("MIXED", fifty, 20, true), "10,00 € ora online, 40,00 € a lavoro finito al professionista");
});

test("forbice di prezzo: il resto è fino a", () => {
  assert.equal(quotePaymentSplitLine("ONLINE", { totalMinEurCents: 4000, totalMaxEurCents: 6000 }, 20, true), "12,00 € ora online, il resto, fino a 48,00 € a lavoro finito");
});

test("tutto ora con il 100%", () => {
  assert.equal(quotePaymentSplitLine("ONLINE", fifty, 100, true), "50,00 € ora online, con carta");
});

test("pagamento diretto o senza prezzo: nessuna cifra", () => {
  assert.equal(quotePaymentSplit("DIRECT", fifty, 20), null);
  assert.equal(quotePaymentSplit("ONLINE", { totalMinEurCents: 0, totalMaxEurCents: 0 }, 20), null);
  assert.equal(quotePaymentSplitLine("DIRECT", fifty, 20, true), "Direttamente al professionista");
});
