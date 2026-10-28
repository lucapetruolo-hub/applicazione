import { test } from "node:test";
import assert from "node:assert/strict";
import { POPULAR_SERVICES } from "./categories";
import { canonicalServiceName, serviceNameKey, serviceNameMatches } from "./serviceNames";

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

test("ogni sinonimo porta a una prestazione suggerita e una variante non ha due significati (§405)", () => {
  const suggested = new Set(Object.values(POPULAR_SERVICES).flat());
  for (const variant of ["cambio caldaia", "dichiarazione di conformità", "controsoffitto", "Copia chiavi", "Ricarica gas", "parquet", "doposcuola", "dog walking", "umidità"]) {
    assert.ok(suggested.has(canonicalServiceName(variant)), variant);
  }
  assert.equal(canonicalServiceName("umidità di risalita"), "Risanamento umidità e infiltrazioni");
  assert.equal(canonicalServiceName("Abbattimento alberi"), "Rimozione alberi");
  // "caldaia" da sola può essere installazione, riparazione o manutenzione: resta com'è.
  assert.equal(canonicalServiceName("caldaia"), "caldaia");
});

test("la casella di \"Quanto costa\" trova le voci con le parole di chi scrive (§405)", () => {
  assert.ok(serviceNameMatches("Riparazione perdita d'acqua", "perdite"));
  assert.ok(serviceNameMatches("Riparazione perdita d'acqua", "perd"));
  assert.ok(serviceNameMatches("Risanamento umidità e infiltrazioni", "umidita"));
  assert.ok(serviceNameMatches("Tinteggiatura interni", "imbiancatura"));
  assert.ok(serviceNameMatches("Tinteggiatura interni", "pittura"));
  assert.ok(serviceNameMatches("Installazione climatizzatore", "condizionatore"));
  assert.ok(serviceNameMatches("Sostituzione caldaia", "Caldaia"));
  assert.ok(!serviceNameMatches("Sostituzione caldaia", "perdite"));
  assert.ok(!serviceNameMatches("Trasloco locale", "zzz"));
});
