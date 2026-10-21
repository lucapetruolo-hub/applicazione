import { describe, expect, it } from "vitest";
import { formatAppointmentTimeRange, wallClockNow, wallClockToday } from "@professionisti/shared";

// Ora di parete italiana scritta in UTC (docs/CHANGELOG.md §278).
describe("orari degli appuntamenti", () => {
  it("mostra l'ora salvata, senza spostarla col fuso", () => {
    expect(formatAppointmentTimeRange("2026-07-15T09:00:00.000Z", "2026-07-15T13:00:00.000Z")).toBe("09:00–13:00");
    expect(formatAppointmentTimeRange("2026-12-15T09:00:00.000Z", null)).toBe("09:00");
  });

  it("legge l'ora italiana di adesso con ora legale e solare", () => {
    expect(wallClockNow(new Date("2026-07-15T07:00:00.000Z")).toISOString()).toBe("2026-07-15T09:00:00.000Z");
    expect(wallClockNow(new Date("2026-12-15T08:00:00.000Z")).toISOString()).toBe("2026-12-15T09:00:00.000Z");
  });

  it("cambio dell'ora a fine ottobre", () => {
    expect(wallClockNow(new Date("2026-10-25T00:30:00.000Z")).toISOString()).toBe("2026-10-25T02:30:00.000Z");
    expect(wallClockNow(new Date("2026-10-25T01:30:00.000Z")).toISOString()).toBe("2026-10-25T02:30:00.000Z");
    expect(wallClockNow(new Date("2026-10-25T02:30:00.000Z")).toISOString()).toBe("2026-10-25T03:30:00.000Z");
  });

  it("dopo mezzanotte in Italia è già il giorno dopo", () => {
    expect(wallClockToday(new Date("2026-07-14T22:30:00.000Z")).toISOString()).toBe("2026-07-15T00:00:00.000Z");
  });
});
