import assert from "node:assert/strict";
import { test } from "node:test";
import { appointmentStillAhead, linkSlotUsable, slotStillOffered } from "./availability";

// 2 novembre 2026, 10:00 UTC = 11:00 in Italia (ora solare).
const NOW = new Date("2026-11-02T10:00:00.000Z");

test("slotStillOffered: propone una fascia di oggi finché non è finita (docs/changelog/2026-11-11-fascia-in-corso.md)", () => {
  assert.equal(slotStillOffered("2026-11-02", "11:00", NOW), false);
  assert.equal(slotStillOffered("2026-11-02", "12:00", NOW), true);
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

test("appointmentStillAhead (docs/changelog/2026-11-11-fascia-in-corso.md): 14-20 va bene fino alle 20", () => {
  // 11/11/2026 14:20 in Italia (UTC+1).
  const at1420 = new Date("2026-11-11T13:20:00.000Z");
  assert.equal(appointmentStillAhead("2026-11-11T14:00:00.000Z", "2026-11-11T20:00:00.000Z", at1420), true);
  assert.equal(appointmentStillAhead("2026-11-11T14:00:00.000Z", "2026-11-11T14:30:00.000Z", at1420), true);
  assert.equal(appointmentStillAhead("2026-11-11T14:00:00.000Z", null, at1420), false);
  assert.equal(appointmentStillAhead("2026-11-11T15:00:00.000Z", null, at1420), true);
  assert.equal(appointmentStillAhead("2026-11-10T14:00:00.000Z", "2026-11-10T20:00:00.000Z", at1420), false);
  // Alle 20:00 in punto la fascia è finita.
  assert.equal(appointmentStillAhead("2026-11-11T14:00:00.000Z", "2026-11-11T20:00:00.000Z", new Date("2026-11-11T19:00:00.000Z")), false);
  // Ora legale: 1/7 14:20 in Italia = 12:20 UTC.
  assert.equal(appointmentStillAhead("2026-07-01T14:00:00.000Z", "2026-07-01T14:30:00.000Z", new Date("2026-07-01T12:20:00.000Z")), true);
  assert.equal(appointmentStillAhead("2026-07-01T14:00:00.000Z", "2026-07-01T14:30:00.000Z", new Date("2026-07-01T13:20:00.000Z")), false);
});
