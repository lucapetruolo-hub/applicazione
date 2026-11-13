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
  assert.deepEqual(quotePaymentOffer({ paymentOptions: ["ONLINE", "MIXED", "DIRECT"], depositPercent: 100 }).paymentOptions, ["ONLINE", "DIRECT"]);
  assert.deepEqual(quotePaymentOffer({ paymentOptions: ["MIXED"], depositPercent: 100 }).paymentOptions, ["ONLINE"]);
  assert.deepEqual(quotePaymentOffer({ paymentOptions: ["ONLINE", "MIXED"], depositPercent: 30 }).paymentOptions, ["ONLINE", "MIXED"]);
});
