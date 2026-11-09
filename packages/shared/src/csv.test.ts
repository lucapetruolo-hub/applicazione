import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { csvCell } from "./csv";

describe("csvCell (controllo dell'08/11, E2-06)", () => {
  it("un testo che Excel aprirebbe come formula prende un apostrofo", () => {
    assert.equal(csvCell("=HYPERLINK(\"http://x\")"), "\"'=HYPERLINK(\"\"http://x\"\")\"");
    assert.equal(csvCell("+39 333"), "'+39 333");
    assert.equal(csvCell("@SOMMA(A1)"), "'@SOMMA(A1)");
    assert.equal(csvCell("-cmd"), "'-cmd");
    assert.equal(csvCell("\tx"), "'\tx");
  });

  it("gli importi negativi restano numeri", () => {
    assert.equal(csvCell("-8,54"), "-8,54");
    assert.equal(csvCell("-7"), "-7");
  });

  it("testo normale e punto e virgola come prima", () => {
    assert.equal(csvCell("Mario Rossi"), "Mario Rossi");
    assert.equal(csvCell("Idraulico; perdita"), "\"Idraulico; perdita\"");
  });
});
