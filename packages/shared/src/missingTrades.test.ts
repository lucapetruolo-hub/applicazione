import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildMissingTrades, cleanMissingTrade, missingTradeZone } from "./missingTrades";

describe("cleanMissingTrade", () => {
  it("pulisce il nome scritto dall'IA", () => {
    assert.equal(cleanMissingTrade("  «sarto». "), "Sarto");
    assert.equal(cleanMissingTrade("Tecnico ANTENNE"), "Tecnico antenne");
  });
  it("scarta ciò che non è un mestiere che manca", () => {
    assert.equal(cleanMissingTrade(null), null);
    assert.equal(cleanMissingTrade("ab"), null);
    assert.equal(cleanMissingTrade("chiama il 333 1234567"), null);
    assert.equal(cleanMissingTrade("uno due tre quattro cinque"), null);
    // Un mestiere che il sito ha già.
    assert.equal(cleanMissingTrade("Idraulico"), null);
  });
});

describe("missingTradeZone", () => {
  it("dà la provincia del comune", () => {
    assert.equal(missingTradeZone("Sabaudia"), "Latina e provincia");
    assert.equal(missingTradeZone("milano"), "Milano e provincia");
  });
  it("senza città o con un nome che non è un comune", () => {
    assert.equal(missingTradeZone(null), "Senza città");
    assert.equal(missingTradeZone("  "), "Senza città");
    assert.equal(missingTradeZone("zona mare"), "Zona mare");
  });
});

describe("buildMissingTrades", () => {
  it("conta per mestiere e per zona, i più richiesti prima", () => {
    const list = buildMissingTrades([
      { missingTrade: "Sarto", city: "Latina" },
      { missingTrade: "sarto", city: "Sabaudia" },
      { missingTrade: "Sarto", city: "Roma" },
      { missingTrade: "Veterinario", city: null },
      { missingTrade: null, city: "Roma" },
      { missingTrade: "Idraulico", city: "Roma" },
    ]);
    assert.deepEqual(list, [
      { name: "Sarto", count: 3, zones: [{ label: "Latina e provincia", count: 2 }, { label: "Roma e provincia", count: 1 }] },
      { name: "Veterinario", count: 1, zones: [{ label: "Senza città", count: 1 }] },
    ]);
  });
});
