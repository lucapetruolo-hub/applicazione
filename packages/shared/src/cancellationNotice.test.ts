import assert from "node:assert/strict";
import { test } from "node:test";
import { freeCancellationUntilLabel } from "./cancellationNotice";

// Orari "di parete": 10 novembre 08:00 italiane salvate come 08:00 UTC.
test("annullamento gratuito fino al giorno e all'ora prima del preavviso", () => {
  assert.equal(freeCancellationUntilLabel("2026-11-10T08:00:00.000Z", 24), "lunedì 9 novembre alle 08:00");
  assert.equal(freeCancellationUntilLabel("2026-11-10T08:00:00.000Z", 72), "sabato 7 novembre alle 08:00");
});
