import { test } from "node:test";
import assert from "node:assert/strict";
import { quoteDepositEurCents, quotePaymentSplit, quotePaymentSplitLine } from "./onlinePayments";

// Cifre di ora e di dopo nella scheda del preventivo e nel PDF
// (docs/changelog/2026-11-05-scheda-preventivo-semplice.md).
const fifty = { totalMinEurCents: 5000, totalMaxEurCents: 5000 };

test("acconto online del 20% su 50 €: 10 € ora, 40 € a lavoro finito", () => {
  assert.deepEqual(quotePaymentSplit("ONLINE", fifty, 20), { nowEurCents: 1000, restMinEurCents: 4000, restMaxEurCents: 4000, restIsRange: false, restOnline: true, nowIsMinimum: false });
  assert.equal(quotePaymentSplitLine("ONLINE", fifty, 20, true), "10,00 € adesso con la carta, il resto (40,00 €) a lavoro finito con la stessa carta");
});

test("saldo diretto: il resto al professionista", () => {
  assert.equal(quotePaymentSplitLine("MIXED", fifty, 20, true), "10,00 € adesso con la carta, il resto (40,00 €) a lavoro finito direttamente al professionista");
});

test("forbice di prezzo: il resto da… a…", () => {
  assert.equal(quotePaymentSplitLine("ONLINE", { totalMinEurCents: 4000, totalMaxEurCents: 6000 }, 20, true), "12,00 € adesso con la carta, il resto (da 28,00 € a 48,00 €) a lavoro finito con la stessa carta");
});

test("tutto ora con il 100%", () => {
  assert.equal(quotePaymentSplitLine("ONLINE", fifty, 100, true), "50,00 € adesso con la carta, tutto il prezzo");
});

// "Tutto online" con la forbice: il minimo adesso, il resto a fine lavoro solo
// se serve (decisione di Luca, docs/changelog/2026-11-13-tutto-online-forbice.md).
test("tutto online con la forbice: il prezzo minimo adesso, il resto solo se serve", () => {
  const totals = { totalMinEurCents: 25000, totalMaxEurCents: 115000 };
  assert.equal(
    quotePaymentSplitLine("ONLINE", totals, 100, true).replace(/\u00a0/g, " "),
    "250,00 € adesso con la carta, il prezzo minimo. Il resto (fino a 900,00 €) a lavoro finito con la stessa carta, solo se il prezzo finale è più alto",
  );
  assert.deepEqual(quotePaymentSplit("ONLINE", totals, 100), {
    nowEurCents: 25000,
    nowIsMinimum: true,
    restMinEurCents: 0,
    restMaxEurCents: 90000,
    restIsRange: true,
    restOnline: true,
  });
  assert.equal(quoteDepositEurCents(totals, 100), 25000);
  // Con un acconto in percentuale non cambia niente: la percentuale del massimo.
  assert.equal(quoteDepositEurCents(totals, 20), 23000);
  // Prezzo unico al 100%: tutto il prezzo.
  assert.equal(quoteDepositEurCents({ totalMinEurCents: 5000, totalMaxEurCents: 5000 }, 100), 5000);
  // Solo il massimo (minimo 0): il massimo, come prima.
  assert.equal(quoteDepositEurCents({ totalMinEurCents: 0, totalMaxEurCents: 5000 }, 100), 5000);
});

test("pagamento diretto o senza prezzo: nessuna cifra", () => {
  assert.equal(quotePaymentSplit("DIRECT", fifty, 20), null);
  assert.equal(quotePaymentSplit("ONLINE", { totalMinEurCents: 0, totalMaxEurCents: 0 }, 20), null);
  assert.equal(quotePaymentSplitLine("DIRECT", fifty, 20, true), "Direttamente al professionista");
});
