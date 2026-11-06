import { test } from "node:test";
import assert from "node:assert/strict";
import { timingForPreferredDate } from "./requestTiming";

// 5 novembre 2026, 10:00 in Italia.
const now = new Date("2026-11-05T09:00:00.000Z");

test("orario di oggi o entro 7 giorni: In settimana, mai Oggi", () => {
  assert.equal(timingForPreferredDate("2026-11-05", now), "WEEK");
  assert.equal(timingForPreferredDate("2026-11-06", now), "WEEK");
  assert.equal(timingForPreferredDate("2026-11-12", now), "WEEK");
});

test("oltre 7 giorni: Con calma", () => {
  assert.equal(timingForPreferredDate("2026-11-13", now), "CALM");
  assert.equal(timingForPreferredDate("2027-01-10", now), "CALM");
});
