import assert from "node:assert/strict";
import { test } from "node:test";
import { comparableQuotes, quoteComparisonHighlights } from "./quoteComparison";

const quote = (id: string, start: string, min: number | null, max: number | null, status = "SENT") => ({
  id,
  status,
  estimatedStartDate: `${start}T10:00:00.000Z`,
  items: [{ priceMinEurCents: min, priceMaxEurCents: max }],
});

test("si confrontano solo i preventivi ancora accettabili", () => {
  const quotes = [quote("a", "2026-11-10", 1, 2), quote("b", "2026-11-10", 1, 2, "MODIFICATION_REQUESTED"), quote("c", "2026-11-10", 1, 2, "REJECTED"), quote("d", "2026-11-10", 1, 2, "WITHDRAWN")];
  assert.deepEqual(comparableQuotes(quotes).map((q) => q.id), ["a", "b"]);
});

test("prezzo più basso dal massimo della forbice, data più vicina", () => {
  const result = quoteComparisonHighlights([quote("a", "2026-11-12", 8000, 12000), quote("b", "2026-11-10", 9000, 11000), quote("c", "2026-11-11", 5000, 15000)]);
  assert.deepEqual(result, { cheapestId: "b", soonestId: "b" });
});

test("a parità di massimo vince il minimo, e un prezzo solo 'da' vale come massimo", () => {
  assert.equal(quoteComparisonHighlights([quote("a", "2026-11-10", 9000, 12000), quote("b", "2026-11-11", 7000, 12000)]).cheapestId, "b");
  assert.equal(quoteComparisonHighlights([quote("a", "2026-11-10", 10000, null), quote("b", "2026-11-11", 7000, 12000)]).cheapestId, "a");
});

test("nessun segno se sono uguali, se un preventivo non ha prezzo o se ce n'è uno solo", () => {
  assert.deepEqual(quoteComparisonHighlights([quote("a", "2026-11-10", 100, 200), quote("b", "2026-11-10", 100, 200)]), { cheapestId: null, soonestId: null });
  assert.equal(quoteComparisonHighlights([quote("a", "2026-11-10", null, null), quote("b", "2026-11-11", 100, 200)]).cheapestId, null);
  assert.deepEqual(quoteComparisonHighlights([quote("a", "2026-11-10", 100, 200)]), { cheapestId: null, soonestId: null });
});
