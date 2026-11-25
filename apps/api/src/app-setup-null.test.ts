import { describe, expect, it } from "vitest";
import { containsNullCharacter } from "./app-setup";

describe("containsNullCharacter (test di sicurezza del 25/11)", () => {
  it("trova il carattere nullo anche dentro oggetti e liste", () => {
    expect(containsNullCharacter("roma\u0000")).toBe(true);
    expect(containsNullCharacter({ a: [{ b: "x\u0000" }] })).toBe(true);
    expect(containsNullCharacter({ ["chiave\u0000"]: 1 })).toBe(true);
  });

  it("lascia passare i corpi normali e quelli grezzi dei webhook", () => {
    expect(containsNullCharacter({ email: "a@b.it", n: 1, ok: true, x: null })).toBe(false);
    expect(containsNullCharacter(Buffer.from([0, 1, 2]))).toBe(false);
    expect(containsNullCharacter(undefined)).toBe(false);
  });
});
