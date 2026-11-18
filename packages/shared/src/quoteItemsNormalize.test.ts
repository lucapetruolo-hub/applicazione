import { test } from "node:test";
import assert from "node:assert/strict";
import { quotePaymentOffer } from "./onlinePayments";
import { capitalizeItemName, quoteItemSchema } from "./schemas";

// Migliorie chieste da Luca il 13/11/2026 (docs/changelog/2026-11-13-annullare-data-passata.md).
test("voci del preventivo con la maiuscola", () => {
  assert.equal(capitalizeItemName(" manodopera "), "Manodopera");
  assert.equal(capitalizeItemName("èlettricità"), "Èlettricità");
  assert.equal(quoteItemSchema.parse({ name: "sostituzione sifone" }).name, "Sostituzione sifone");
});

test("acconto al 100%: niente \"acconto online, saldo diretto\", resta \"tutto online\"", () => {
  const single = [{ priceMinEurCents: 5000, priceMaxEurCents: 5000 }];
  const range = [{ priceMinEurCents: 5000, priceMaxEurCents: 8000 }];
  // Prezzo unico al 100%: le due scelte online coincidono, resta "tutto online".
  assert.deepEqual(quotePaymentOffer({ paymentOptions: ["ONLINE", "MIXED", "DIRECT"], depositPercent: 100, items: single }).paymentOptions, ["ONLINE", "DIRECT"]);
  assert.deepEqual(quotePaymentOffer({ paymentOptions: ["MIXED"], depositPercent: 100, items: single }).paymentOptions, ["ONLINE"]);
  // Con la forbice l'acconto è il minimo: restano tutte e due (Luca, 18/11/2026).
  assert.deepEqual(quotePaymentOffer({ paymentOptions: ["ONLINE", "MIXED", "DIRECT"], depositPercent: 100, items: range }).paymentOptions, ["ONLINE", "MIXED", "DIRECT"]);
  assert.deepEqual(quotePaymentOffer({ paymentOptions: ["MIXED"], depositPercent: 100 }).paymentOptions, ["MIXED"]);
  assert.deepEqual(quotePaymentOffer({ paymentOptions: ["ONLINE", "MIXED"], depositPercent: 30 }).paymentOptions, ["ONLINE", "MIXED"]);
});
