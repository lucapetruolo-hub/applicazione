import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { jobPlaceLabel, serviceModeLabel } from "./jobPlace";

describe("jobPlaceLabel", () => {
  it("a domicilio con la città", () => {
    assert.equal(jobPlaceLabel("Idraulico", "Marcianise", "HOME"), "Idraulico a domicilio a Marcianise");
    assert.equal(jobPlaceLabel("Idraulico", null, "HOME"), "Idraulico a domicilio");
  });
  it("online senza la città", () => {
    assert.equal(jobPlaceLabel("Idraulico", "Marcianise", "ONLINE"), "Idraulico online");
  });
  it("senza il tipo: testo di sempre", () => {
    assert.equal(jobPlaceLabel("Idraulico", "Marcianise", undefined), "Idraulico a Marcianise");
    assert.equal(jobPlaceLabel("Idraulico", " ", null), "Idraulico");
  });
  it("etichetta breve", () => {
    assert.equal(serviceModeLabel("HOME"), "A domicilio");
    assert.equal(serviceModeLabel("ONLINE"), "Online");
    assert.equal(serviceModeLabel("ALTRO"), null);
  });
});
