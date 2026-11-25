import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { publicCoordinate } from "./professionals";

describe("publicCoordinate", () => {
  it("arrotonda a due decimali (circa 1 km)", () => {
    assert.equal(publicCoordinate(45.07201411793693), 45.07);
    assert.equal(publicCoordinate(7.685546900352924), 7.69);
    assert.equal(publicCoordinate(41.904), 41.9);
  });
});
