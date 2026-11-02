import assert from "node:assert/strict";
import { test } from "node:test";
import { linkSlotUsable, slotStillOffered } from "./availability";

// 2 novembre 2026, 10:00 UTC = 11:00 in Italia (ora solare).
const NOW = new Date("2026-11-02T10:00:00.000Z");

test("slotStillOffered (collaudo B-05, D-09): non propone una fascia di oggi già finita o quasi finita", () => {
  assert.equal(slotStillOffered("2026-11-02", "12:00", NOW), false);
  assert.equal(slotStillOffered("2026-11-02", "13:00", NOW), true);
  assert.equal(slotStillOffered("2026-11-01", "18:00", NOW), false);
  assert.equal(slotStillOffered("2026-11-03", "09:00", NOW), true);
});

test("linkSlotUsable (collaudo I-07): accetta solo una data vera e una fascia ben scritta, non passata", () => {
  assert.equal(linkSlotUsable("2026-11-05", "08:00-13:00", NOW), true);
  assert.equal(linkSlotUsable("2026-02-31", "08:00-13:00", NOW), false);
  assert.equal(linkSlotUsable("2026-11-05", "25:00-99:00", NOW), false);
  assert.equal(linkSlotUsable("2026-11-05", "13:00-08:00", NOW), false);
  assert.equal(linkSlotUsable("2026-10-30", "08:00-13:00", NOW), false);
  assert.equal(linkSlotUsable(undefined, "08:00-13:00", NOW), false);
});
