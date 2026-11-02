import { test } from "node:test";
import assert from "node:assert/strict";
import { suggestEmailCorrection } from "./emailSuggestion";

test("propone il dominio giusto per gli errori di battitura più comuni", () => {
  assert.equal(suggestEmailCorrection("mario@gmial.com"), "mario@gmail.com");
  assert.equal(suggestEmailCorrection("mario@gmail.con"), "mario@gmail.com");
  assert.equal(suggestEmailCorrection("mario@gmail.it"), "mario@gmail.com");
  assert.equal(suggestEmailCorrection("mario@gmail"), "mario@gmail.com");
  assert.equal(suggestEmailCorrection("mario@gmail,com"), "mario@gmail.com");
  assert.equal(suggestEmailCorrection("Mario.Rossi@Libero.ti"), "mario.rossi@libero.it");
  assert.equal(suggestEmailCorrection("anna@hotmal.it"), "anna@hotmail.it");
  assert.equal(suggestEmailCorrection("anna@yaho.it"), "anna@yahoo.it");
  assert.equal(suggestEmailCorrection("anna@icloud.co"), "anna@icloud.com");
  assert.equal(suggestEmailCorrection("anna@outlok.it"), "anna@outlook.it");
});

test("non tocca domini giusti, aziendali o incompleti", () => {
  for (const email of ["mario@gmail.com", "mario@libero.it", "mario@tin.it", "info@studio-rossi.it", "info@idraulicaverdi.com", "mario@", "mario", "@gmail.com", "", "mario@gmx.it"]) {
    assert.equal(suggestEmailCorrection(email), null, email);
  }
});
