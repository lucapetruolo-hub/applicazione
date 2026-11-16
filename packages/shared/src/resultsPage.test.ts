import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  activeResultFilterCount,
  hasFreeSlotWithin24h,
  hasFreeSlotWithinDays,
  matchesAvailabilityFilters,
  matchesProfileFilters,
  parseResultFilters,
  pagerItems,
  parseResultsPage,
  resultFilterEntries,
  resultsFacts,
  resultsPageQuery,
} from "./resultsPage";

const day = (date: string, time: string, free: boolean) => ({
  date,
  times: [{ time, endTime: "23:59", allowsHome: true, allowsOnline: false, homeAvailable: free, onlineAvailable: false }],
});

describe("risultati a pagine: filtri", () => {
  it("indirizzo e filtri vanno e tornano uguali, i valori sconosciuti si ignorano", () => {
    const filters = { online: true, urgent: true, availability: "3days" as const, language: "Inglese", insured: true, onlinePayment: true, subTag: "caldaie" };
    const params = new URLSearchParams(resultFilterEntries(filters));
    assert.deepEqual(parseResultFilters((name) => params.get(name)), filters);
    assert.deepEqual(parseResultFilters((name) => ({ online: "si", disponibilita: "domani" })[name]), {});
    assert.equal(activeResultFilterCount(filters), 6);
  });

  it("numero di pagina: 1 se manca o non è valido", () => {
    assert.equal(parseResultsPage("3"), 3);
    for (const value of [null, "", "0", "-2", "1.5", "abc", "1001"]) assert.equal(parseResultsPage(value), 1);
  });

  it("filtri del profilo", () => {
    const pro = { remoteAvailable: false, spokenLanguages: ["Italiano"], hasLiabilityInsurance: true, stripeVerified: false, subTags: ["caldaie"] };
    assert.equal(matchesProfileFilters(pro, { insured: true, subTag: "caldaie" }), true);
    assert.equal(matchesProfileFilters(pro, { online: true }), false);
    assert.equal(matchesProfileFilters(pro, { language: "Inglese" }), false);
    assert.equal(matchesProfileFilters(pro, { onlinePayment: true }), false);
  });

  it("oggi ed entro 3 giorni guardano i giorni di calendario", () => {
    const days = [day("2026-11-16", "09:00", false), day("2026-11-18", "09:00", true)];
    assert.equal(hasFreeSlotWithinDays(days, "2026-11-16", 0), false);
    assert.equal(hasFreeSlotWithinDays(days, "2026-11-16", 2), true);
    assert.equal(matchesAvailabilityFilters(days, "2026-11-16", { availability: "today" }, 0), false);
  });

  it("urgente: un orario libero nelle prossime 24 ore reali", () => {
    const now = Date.parse("2026-11-16T20:00:00Z");
    assert.equal(hasFreeSlotWithin24h([day("2026-11-17", "19:00", true)], now), true);
    assert.equal(hasFreeSlotWithin24h([day("2026-11-17", "21:00", true)], now), false);
    assert.equal(hasFreeSlotWithin24h([day("2026-11-16", "09:00", true)], now), false);
  });
});

describe("risultati a pagine: riassunto di tutti i trovati", () => {
  it("conta verificati, recensioni, specializzazioni, prestazioni e città", () => {
    const pro = (city: string, rating: number | null, reviewCount: number, subTags: string[], services: string[]) => ({
      verified: rating !== null,
      reviewCount,
      rating,
      subTags,
      services: services.map((name) => ({ name })),
      city,
    });
    const facts = resultsFacts([
      pro("Latina", 5, 2, ["caldaie"], ["Caldaia", "Rubinetto"]),
      pro("latina ", 4, 1, ["caldaie", "scarichi"], ["Caldaia", "Scarico"]),
      pro("Aprilia", null, 0, [], ["Boiler"]),
    ] as never);
    assert.deepEqual(facts, {
      count: 3,
      verified: 2,
      reviewCount: 3,
      ratingSum: 14,
      subTagCounts: { caldaie: 2, scarichi: 1 },
      services: ["Caldaia", "Rubinetto", "Scarico"],
      cities: [
        { city: "Latina", count: 2 },
        { city: "Aprilia", count: 1 },
      ],
    });
  });
});

describe("risultati a pagine: numeri sotto le schede", () => {
  it("la prima, l'ultima e le vicine, con … dove ne mancano più di una", () => {
    assert.deepEqual(pagerItems(1, 1), [1]);
    assert.deepEqual(pagerItems(1, 3), [1, 2, 3]);
    assert.deepEqual(pagerItems(1, 10), [1, 2, "gap", 10]);
    assert.deepEqual(pagerItems(5, 10), [1, "gap", 4, 5, 6, "gap", 10]);
    assert.deepEqual(pagerItems(4, 10), [1, 2, 3, 4, 5, "gap", 10]);
    assert.deepEqual(pagerItems(10, 10), [1, "gap", 9, 10]);
  });
});

describe("risultati a pagine: parametri della chiamata", () => {
  it("filtri, pagina dalla seconda e inquadratura", () => {
    assert.deepEqual(resultsPageQuery({ online: true }), [["online", "1"]]);
    assert.deepEqual(resultsPageQuery({}, 3, { north: 42, south: 41, east: 13.5, west: 12 }), [
      ["pagina", "3"],
      ["nord", "42"],
      ["sud", "41"],
      ["est", "13.5"],
      ["ovest", "12"],
    ]);
  });
});
