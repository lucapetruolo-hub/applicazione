import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { arrivalTimeChoices, arrivalWindowText, arrivalWord } from "./arrivalWindow";

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

describe("arrivalTimeChoices", () => {
  it("una all'ora, solo dentro la fascia", () => {
    assert.deepEqual(arrivalTimeChoices("14:00", "20:00"), ["14:00", "15:00", "16:00", "17:00", "18:00", "19:00"]);
  });
  it("fascia che non parte all'ora piena", () => {
    assert.deepEqual(arrivalTimeChoices("08:30", "12:00"), ["08:30", "09:30", "10:30", "11:30"]);
  });
  it("tiene un orario già salvato dentro la fascia", () => {
    assert.deepEqual(arrivalTimeChoices("14:00", "17:00", "15:15"), ["14:00", "15:00", "15:15", "16:00"]);
  });
  it("non tiene un orario fuori dalla fascia", () => {
    assert.deepEqual(arrivalTimeChoices("14:00", "17:00", "17:00"), ["14:00", "15:00", "16:00"]);
  });
});

describe("arrivalWord", () => {
  it("a domicilio arriva, online ti contatta", () => {
    assert.equal(arrivalWord("HOME"), "Arrivo");
    assert.equal(arrivalWord(null), "Arrivo");
    assert.equal(arrivalWord("ONLINE"), "Ti contatta");
  });
});
