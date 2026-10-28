import { describe, expect, it } from "vitest";
import { countingFrom, daySinceLaunch, dayFrom, sinceLaunch } from "./counted";
import { launchDate } from "../subscriptions/subscription-rules";

/** Numeri contati solo dal lancio (docs/CHANGELOG.md §395). */
describe("numeri dal lancio", () => {
  const launch = launchDate("2026-12-01")!;

  it("prima del lancio, o senza data, si conta tutto", () => {
    expect(countingFrom(new Date("2026-11-20T10:00:00Z"), launch)).toBeNull();
    expect(countingFrom(new Date("2026-11-20T10:00:00Z"), null)).toBeNull();
  });

  it("dal lancio un periodo non parte mai prima del lancio", () => {
    const from = countingFrom(new Date("2026-12-10T10:00:00Z"), launch);
    expect(from?.toISOString()).toBe("2026-11-30T23:00:00.000Z");
    expect(sinceLaunch(new Date("2026-11-10T00:00:00Z"), from).toISOString()).toBe("2026-11-30T23:00:00.000Z");
    // Un periodo già dopo il lancio resta com'è.
    expect(sinceLaunch(new Date("2026-12-05T00:00:00Z"), from).toISOString()).toBe("2026-12-05T00:00:00.000Z");
  });

  it("i contatori per giorno partono dalla data del lancio, non dalla sera prima", () => {
    const from = countingFrom(new Date("2026-12-10T10:00:00Z"), launch);
    expect(dayFrom(from)?.toISOString()).toBe("2026-12-01T00:00:00.000Z");
    expect(daySinceLaunch(new Date("2026-11-10T00:00:00Z"), from).toISOString()).toBe("2026-12-01T00:00:00.000Z");
    expect(daySinceLaunch(new Date("2026-11-10T00:00:00Z"), null).toISOString()).toBe("2026-11-10T00:00:00.000Z");
  });
});
