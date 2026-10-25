import { describe, expect, it } from "vitest";
import { appointmentMoment, formatAppointmentTimeRange, wallClockNow, wallClockToday } from "@professionisti/shared";

// Ora di parete italiana scritta in UTC (docs/CHANGELOG.md §287).
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

// Riga in cima alla scheda del lavoro accettato, lato cliente (docs/CHANGELOG.md §346).
describe("momento dell'appuntamento", () => {
  const start = "2026-10-28T14:00:00.000Z";
  const end = "2026-10-28T16:00:00.000Z";
  // 25 ottobre alle 12 in Italia (ora solare dalle 3 di notte).
  const now = new Date("2026-10-25T11:00:00.000Z");

  it("conta i giorni di calendario, non le ore", () => {
    expect(appointmentMoment(start, end, null, now)).toEqual({ kind: "days", days: 3 });
    expect(appointmentMoment(start, end, null, new Date("2026-10-27T23:30:00.000Z"))).toEqual({ kind: "today" });
    expect(appointmentMoment(start, end, null, new Date("2026-10-27T08:00:00.000Z"))).toEqual({ kind: "tomorrow" });
  });

  it("dopo 'Sto arrivando' mostra l'ora della partenza in ora italiana", () => {
    expect(appointmentMoment(start, end, "2026-10-28T12:42:00.000Z", new Date("2026-10-28T12:50:00.000Z"))).toEqual({ kind: "onTheWay", since: "13:42" });
  });

  it("durante la fascia è in corso, dopo la fine chiede com'è andata", () => {
    expect(appointmentMoment(start, end, null, new Date("2026-10-28T13:30:00.000Z"))).toEqual({ kind: "inProgress" });
    expect(appointmentMoment(start, end, "2026-10-28T12:42:00.000Z", new Date("2026-10-28T15:01:00.000Z"))).toEqual({ kind: "over" });
    expect(appointmentMoment(start, null, null, new Date("2026-10-28T14:30:00.000Z"))).toEqual({ kind: "over" });
  });

  it("un lavoro su più giorni resta in corso fino all'ultimo giorno", () => {
    expect(appointmentMoment("2026-11-04T08:00:00.000Z", "2026-11-06T17:00:00.000Z", null, new Date("2026-11-05T10:00:00.000Z"))).toEqual({ kind: "inProgress" });
  });
});
