import { describe, expect, it } from "vitest";
import { lastVisibleChange } from "./last-visible-change";

describe("lastVisibleChange", () => {
  const profile = new Date("2026-10-01T10:00:00Z");

  it("senza prestazioni né recensioni è la data del profilo", () => {
    expect(lastVisibleChange(profile, [], []).toISOString()).toBe(profile.toISOString());
  });

  it("prende la più recente tra profilo, prestazioni e recensioni", () => {
    const result = lastVisibleChange(
      profile,
      [{ createdAt: new Date("2026-10-05T10:00:00Z") }],
      [{ createdAt: new Date("2026-10-20T08:00:00Z") }, { createdAt: new Date("2026-09-01T08:00:00Z") }],
    );
    expect(result.toISOString()).toBe("2026-10-20T08:00:00.000Z");
  });
});
