import { describe, expect, it } from "vitest";
import { publicCoordinate } from "./professionals";

describe("publicCoordinate", () => {
  it("arrotonda a due decimali (circa 1 km)", () => {
    expect(publicCoordinate(45.07201411793693)).toBe(45.07);
    expect(publicCoordinate(7.685546900352924)).toBe(7.69);
    expect(publicCoordinate(41.904)).toBe(41.9);
  });
});
