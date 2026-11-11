import assert from "node:assert/strict";
import { test } from "node:test";
import { appointmentStillAhead, linkSlotUsable, slotStillOffered } from "./availability";

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

test("appointmentStillAhead (docs/changelog/2026-11-11-fascia-in-corso.md): una fascia in corso con almeno due ore davanti si accetta ancora", () => {
  // 11/11/2026 14:20 in Italia (UTC+1).
  const at1420 = new Date("2026-11-11T13:20:00.000Z");
  assert.equal(appointmentStillAhead("2026-11-11T14:00:00.000Z", "2026-11-11T20:00:00.000Z", at1420), true);
  assert.equal(appointmentStillAhead("2026-11-11T14:00:00.000Z", "2026-11-11T16:00:00.000Z", at1420), false);
  assert.equal(appointmentStillAhead("2026-11-11T14:00:00.000Z", null, at1420), false);
  assert.equal(appointmentStillAhead("2026-11-11T15:00:00.000Z", "2026-11-11T16:00:00.000Z", at1420), true);
  assert.equal(appointmentStillAhead("2026-11-10T14:00:00.000Z", "2026-11-10T20:00:00.000Z", at1420), false);
  // Ora legale: 1/7 14:20 in Italia = 12:20 UTC.
  assert.equal(appointmentStillAhead("2026-07-01T14:00:00.000Z", "2026-07-01T16:30:00.000Z", new Date("2026-07-01T12:20:00.000Z")), true);
});

test("slotStillOffered con l'inizio: una fascia breve non ancora cominciata resta proposta", () => {
  const at0730 = new Date("2026-11-11T06:30:00.000Z");
  assert.equal(slotStillOffered("2026-11-11", "09:00", at0730, "08:00"), true);
  assert.equal(slotStillOffered("2026-11-11", "09:00", at0730), false);
});
