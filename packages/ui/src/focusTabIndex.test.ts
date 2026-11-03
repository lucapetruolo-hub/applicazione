import assert from "node:assert/strict";
import { test } from "node:test";
import { focusTabIndex } from "./focusTabIndex";

test("un riquadro con ruolo da comando si raggiunge col Tab", () => {
  for (const role of ["button", "checkbox", "link", "radio", "textbox", "switch"]) {
    assert.equal(focusTabIndex("div", { role }), "0");
  }
  assert.equal(focusTabIndex("div", { role: "menuitem" }), undefined);
  assert.equal(focusTabIndex("div", {}), undefined);
});

test("un tabIndex scritto resta quello", () => {
  assert.equal(focusTabIndex("div", { role: "button", tabIndex: -1 }), undefined);
});

test("focusable decide, come in Tamagui 1", () => {
  assert.equal(focusTabIndex("div", { role: "button", focusable: false }), "-1");
  assert.equal(focusTabIndex("div", { focusable: true }), "0");
  assert.equal(focusTabIndex("button", { role: "button" }), undefined);
  assert.equal(focusTabIndex("a", { focusable: false }), "-1");
});
