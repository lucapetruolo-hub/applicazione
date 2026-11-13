import { test } from "node:test";
import assert from "node:assert/strict";
import { MODERATION_ACTIONS_BY_TARGET, clientCanUpdateReview } from "./index";

// "Chiedi all'autore di correggere" per le recensioni (docs/changelog/2026-11-13-admin-ia-propone.md).
test("recensione: si può chiedere all'autore di correggerla", () => {
  assert.ok(MODERATION_ACTIONS_BY_TARGET.REVIEW.includes("REQUEST_CORRECTION"));
});

test("con la correzione chiesta il cliente può cambiare la recensione", () => {
  const base = { hasReview: true, reviewUpdatedAt: null, issue: null };
  assert.equal(clientCanUpdateReview(base), false);
  assert.equal(clientCanUpdateReview({ ...base, correctionRequestedAt: new Date() }), true);
  assert.equal(clientCanUpdateReview({ ...base, hasReview: false, correctionRequestedAt: new Date() }), false);
});
