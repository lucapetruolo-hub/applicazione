import { describe, expect, it } from "vitest";
import { scheduleChangeAlternative, scheduleChangeBetween, scheduleChangeObject } from "@professionisti/shared";

describe("scheduleChangeBetween — data, orario o entrambi (docs/CHANGELOG.md §180)", () => {
  const before = { start: new Date("2026-10-09T10:00:00.000Z"), end: new Date("2026-10-09T12:00:00.000Z") };

  it("solo la data", () => {
    expect(scheduleChangeBetween(before, { start: new Date("2026-10-10T10:00:00.000Z"), end: new Date("2026-10-10T12:00:00.000Z") })).toBe("date");
  });

  it("solo l'orario", () => {
    expect(scheduleChangeBetween(before, { start: new Date("2026-10-09T14:00:00.000Z"), end: new Date("2026-10-09T16:00:00.000Z") })).toBe("time");
  });

  it("solo l'ora di fine conta come orario", () => {
    expect(scheduleChangeBetween(before, { start: before.start, end: new Date("2026-10-09T13:00:00.000Z") })).toBe("time");
  });

  it("data e orario", () => {
    expect(scheduleChangeBetween(before, { start: new Date("2026-10-12T08:00:00.000Z"), end: new Date("2026-10-12T09:00:00.000Z") })).toBe("both");
  });

  it("nessun cambio", () => {
    expect(scheduleChangeBetween(before, { ...before })).toBeNull();
  });

  it("testi", () => {
    expect(scheduleChangeObject("both")).toBe("la data e l'orario");
    expect(scheduleChangeAlternative("time")).toBe("un altro orario");
  });
});
