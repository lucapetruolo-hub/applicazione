import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { arrivalWindowText } from "./arrivalWindow";

describe("arrivalWindowText", () => {
  it("un'ora dall'arrivo", () => {
    assert.equal(arrivalWindowText("10:00", "2026-10-26T08:00:00.000Z", "2026-10-26T19:00:00.000Z"), "tra le 10:00 e le 11:00");
  });
  it("mai oltre la fine della fascia", () => {
    assert.equal(arrivalWindowText("18:30", "2026-10-26T08:00:00.000Z", "2026-10-26T19:00:00.000Z"), "tra le 18:30 e le 19:00");
  });
  it("senza fascia di un giorno solo, un'ora", () => {
    assert.equal(arrivalWindowText("16:15", "2026-10-26T08:00:00.000Z", null), "tra le 16:15 e le 17:15");
  });
});
