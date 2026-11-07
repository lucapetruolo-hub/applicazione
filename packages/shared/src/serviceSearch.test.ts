import { test } from "node:test";
import assert from "node:assert/strict";
import { matchPopularServices, offersPopularService, sameServiceWord } from "./serviceSearch";

test("parole diverse con le stesse prime lettere non sono la stessa", () => {
  assert.ok(!sameServiceWord("serramenti", "serratura"));
  assert.ok(!sameServiceWord("elettrodomestici", "elettrico"));
  assert.ok(!matchPopularServices("serramenti").some((m) => m.service.toLowerCase().includes("serratur")));
});

test("plurali, desinenze e parole scritte a metà restano uguali", () => {
  assert.ok(sameServiceWord("perdite", "perdita"));
  assert.ok(sameServiceWord("rubinetto", "rubinetteria"));
  assert.ok(sameServiceWord("rubinet", "rubinetteria"));
  assert.ok(sameServiceWord("condizionatori", "condizionatore"));
  assert.ok(offersPopularService("Sostituzione rubinetti e sifoni", "Sostituzione rubinetteria"));
});

test("le prestazioni più cercate su Google si trovano", () => {
  assert.deepEqual(matchPopularServices("installazione condizionatore", "climatizzazione"), [{ categorySlug: "climatizzazione", service: "Installazione condizionatore" }]);
  assert.ok(matchPopularServices("vasca in doccia").some((m) => m.service === "Trasformazione vasca in doccia"));
  assert.ok(matchPopularServices("pompa di calore").some((m) => m.service === "Installazione pompa di calore"));
  assert.ok(matchPopularServices("installazione caldaia").some((m) => m.service === "Installazione caldaia"));
});
