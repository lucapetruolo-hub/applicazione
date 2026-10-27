import assert from "node:assert/strict";
import { test } from "node:test";
import { buildSearchIndex, matchTier, normalizeSearchText, rankSearchMatches } from "./searchMatch";

const comuni = ["Latiano", "Latina", "Cisterna di Latina", "Platì", "Sabaudia", "Forlì", "L'Aquila", "Roma", "Rima San Giuseppe", "Fabrica di Roma"];
const index = buildSearchIndex(comuni, (c) => c);

test("accenti, maiuscole e apostrofi non contano", () => {
  assert.equal(normalizeSearchText("  L'Aquila "), "l aquila");
  assert.equal(normalizeSearchText("FORLÌ"), "forli");
});

test("prima chi inizia così, poi chi ha una parola che inizia così, poi chi contiene", () => {
  assert.deepEqual(rankSearchMatches(index, "lat"), ["Latiano", "Latina", "Cisterna di Latina", "Platì"]);
});

test("a parità, la priorità decide (città con professionisti prima)", () => {
  const priority = (c: string) => (c === "Latina" ? 0 : 1);
  assert.deepEqual(rankSearchMatches(index, "lat", { priority }).slice(0, 2), ["Latina", "Latiano"]);
});

test("un errore di battitura porta comunque al comune giusto", () => {
  // Latina somiglia per intero, Latiano solo all'inizio.
  assert.deepEqual(rankSearchMatches(index, "Latna").slice(0, 2), ["Latina", "Latiano"]);
  assert.ok(rankSearchMatches(index, "sabuadia").includes("Sabaudia"));
  assert.ok(rankSearchMatches(index, "laquila").includes("L'Aquila"));
});

test("gli errori non entrano se c'è già una corrispondenza vera", () => {
  assert.deepEqual(rankSearchMatches(index, "roma"), ["Roma", "Fabrica di Roma"]);
});

test("sotto le 4 lettere niente errori di battitura", () => {
  assert.equal(matchTier("roma", "rpm"), null);
});

test("campo vuoto: tutto, nell'ordine di priorità", () => {
  assert.equal(rankSearchMatches(index, "").length, comuni.length);
});
