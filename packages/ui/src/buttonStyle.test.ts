import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { FRAME_PROPS, buttonModuleCss, buttonStyleOutput, mergeButtonStyle, parseButtonValue } from "./buttonStyle";

// Pulsante del sito in HTML semplice (docs/changelog/2026-11-10-pulsanti-senza-tamagui.md).
describe("Button.module.css", () => {
  it("è aggiornato (pnpm --filter @professionisti/ui genera-css-pulsante)", () => {
    assert.equal(readFileSync(new URL("./Button.module.css", import.meta.url), "utf8"), buttonModuleCss());
  });
});

describe("parseButtonValue", () => {
  it("divide i valori piatti di Tamagui nelle condizioni", () => {
    assert.deepEqual(parseButtonValue("44px xs:40px", "size"), { base: "44px", xs: "40px" });
    assert.deepEqual(parseButtonValue("transparent hover:#F7F3EE press:#E7E0D7", "none"), { base: "transparent", hover: "#F7F3EE", press: "#E7E0D7" });
    assert.deepEqual(parseButtonValue("focus-visible:outlineColor", "none"), { focusVisible: "var(--outlineColor)" });
    assert.deepEqual(parseButtonValue("blue10 hover:blue9", "none"), { base: "var(--blue10)", hover: "var(--blue9)" });
  });
  it("traduce numeri e token come Tamagui", () => {
    assert.deepEqual(parseButtonValue(36, "size"), { base: "36px" });
    assert.deepEqual(parseButtonValue(0.6, "none"), { base: "0.6" });
    assert.deepEqual(parseButtonValue(1, "flex"), { base: "1 1 auto" });
    assert.deepEqual(parseButtonValue("xs:1", "flex"), { xs: "1" });
    assert.deepEqual(parseButtonValue("4 xs:3", "space"), { base: "var(--t-space-4)", xs: "var(--t-space-3)" });
    assert.deepEqual(parseButtonValue("var(--t-size-4)", "size"), { base: "var(--t-size-4)" });
  });
});

describe("mergeButtonStyle", () => {
  it("vince la prop scritta per ultima, stati compresi; undefined toglie la proprietà", () => {
    const map = mergeButtonStyle({}, { backgroundColor: "blue10 hover:blue9", height: 44 }, FRAME_PROPS);
    mergeButtonStyle(map, { backgroundColor: "#B42318", height: undefined, onPress: () => {} }, FRAME_PROPS);
    assert.deepEqual(map, { backgroundColor: { base: "#B42318" } });
  });
  it("dà a ogni proprietà e condizione la sua classe e variabile", () => {
    const classes = { f_height_base: "h", f_height_xs: "hx" };
    assert.deepEqual(buttonStyleOutput({ height: { base: "44px", xs: "40px" } }, "f", classes), { className: "h hx", style: { "--bf-height-base": "44px", "--bf-height-xs": "40px" } });
  });
});
