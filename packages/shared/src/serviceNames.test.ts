import { test } from "node:test";
import assert from "node:assert/strict";
import { POPULAR_SERVICES } from "./categories";
import { canonicalServiceName, serviceNameKey } from "./serviceNames";

test("le varianti scritte a mano finiscono nella stessa voce", () => {
  for (const variant of ["riparazione perdite", "Riparazione perdita d'acqua", "RIPARAZIONE PERDITE D'ACQUA", "perdite"]) {
    assert.equal(canonicalServiceName(variant), "Riparazione perdita d'acqua", variant);
  }
  assert.equal(canonicalServiceName("cambio serrature"), "Sostituzione serratura");
  assert.equal(canonicalServiceName("Montaggio  mobili"), "Montaggio mobili");
  assert.equal(canonicalServiceName("Pulizie di casa "), "Pulizie di casa");
});

test("un nome sconosciuto resta com'è, ripulito dagli spazi", () => {
  assert.equal(canonicalServiceName("  Posa  carta da parati "), "Posa carta da parati");
});

test("accenti, maiuscole e plurali non contano", () => {
  assert.equal(serviceNameKey("Pulizia vetri"), serviceNameKey("pulizie VETRO"));
  assert.equal(serviceNameKey("Perché"), serviceNameKey("perche"));
});

test("nessun sinonimo porta a un nome che non esiste tra i suggeriti", () => {
  const suggested = new Set(Object.values(POPULAR_SERVICES).flat());
  for (const variant of ["riparazione lavatrice", "sgombero", "imbiancatura", "taglio siepe"]) {
    assert.ok(suggested.has(canonicalServiceName(variant)), variant);
  }
});
