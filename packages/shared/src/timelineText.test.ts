import { test } from "node:test";
import assert from "node:assert/strict";
import { personalizeEventMessage } from "./timelineText";
import { formatClockDeadline } from "./requestDeadline";

test("la richiesta inviata si legge in seconda persona dal cliente (E6-06)", () => {
  assert.equal(personalizeEventMessage("Il cliente ha inviato una richiesta di preventivo direttamente a te.", "CLIENT", "CLIENT"), "Hai inviato la richiesta di preventivo.");
  assert.equal(
    personalizeEventMessage("Il cliente ha scelto te e un altro professionista per questa richiesta di preventivo.", "CLIENT", "CLIENT"),
    "Hai inviato la richiesta di preventivo.",
  );
  assert.equal(personalizeEventMessage("Il cliente ha annullato il lavoro.", "CLIENT", "CLIENT"), "Hai annullato il lavoro.");
  // L'altra parte legge il testo del server.
  assert.equal(personalizeEventMessage("Il cliente ha annullato il lavoro.", "CLIENT", "PROFESSIONAL"), "Il cliente ha annullato il lavoro.");
  assert.equal(personalizeEventMessage("Il professionista ha annullato il lavoro.", "PROFESSIONAL", "PROFESSIONAL"), "Hai annullato il lavoro.");
});

test("l'ora dell'inoltro si dice come a voce (E6-11)", () => {
  // 8 novembre 2026, 12:05 in Italia (ora solare, UTC+1).
  const now = new Date("2026-11-08T11:05:00Z");
  assert.equal(formatClockDeadline(new Date("2026-11-08T17:05:00Z"), now), "le 18:05");
  assert.equal(formatClockDeadline(new Date("2026-11-09T08:30:00Z"), now), "domani alle 09:30");
  assert.equal(formatClockDeadline(new Date("2026-11-12T08:30:00Z"), now), "il 12 novembre alle 09:30");
  assert.equal(formatClockDeadline(new Date("2026-12-08T08:30:00Z"), now), "l'8 dicembre alle 09:30");
  assert.equal(formatClockDeadline(new Date("2026-11-08T00:30:00Z"), now), "le 01:30");
});
