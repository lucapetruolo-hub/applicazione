import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatDistanceKm, priceUnitSuffix } from "./cardText";

// Collaudo dell'08/11/2026: "da 50 € undefined" (E6-02) e "a 0 km" (E6-20).
describe("priceUnitSuffix", () => {
  it("non scrive nulla per il prezzo a lavoro", () => {
    assert.equal(priceUnitSuffix("JOB"), "");
    assert.equal(priceUnitSuffix(undefined), "");
  });
  it("scrive l'unità quando c'è", () => {
    assert.equal(priceUnitSuffix("HOUR"), " all'ora");
    assert.equal(priceUnitSuffix("SQUARE_METER"), " al m²");
  });
});

describe("formatDistanceKm", () => {
  it("non dice mai 0 km", () => {
    assert.equal(formatDistanceKm(0), "a meno di 1 km");
    assert.equal(formatDistanceKm(0.4), "a meno di 1 km");
  });
  it("un decimale sotto i 10 km, intero sopra", () => {
    assert.equal(formatDistanceKm(3.46), "a 3,5 km");
    assert.equal(formatDistanceKm(12.6), "a 13 km");
  });
});
