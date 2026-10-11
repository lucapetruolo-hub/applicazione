import { describe, expect, it } from "vitest";
import { addDaytimeHours, computeDirectForwardAt } from "./lead-routing";

// Settembre: ora legale, Roma = UTC+2.
describe("addDaytimeHours (tempo di risposta solo tra le 8 e le 21, ora italiana)", () => {
  it("di giorno scorre normalmente: 10:00 + 4h = 14:00", () => {
    expect(addDaytimeHours(new Date("2026-09-24T08:00:00Z"), 4).toISOString()).toBe("2026-09-24T12:00:00.000Z");
  });

  it("una richiesta alle 23 scade alle 12 del giorno dopo, non alle 3 di notte", () => {
    expect(addDaytimeHours(new Date("2026-09-24T21:00:00Z"), 4).toISOString()).toBe("2026-09-25T10:00:00.000Z");
  });

  it("a cavallo della sera: 19:00 + 4h = 2 ore oggi e 2 domattina → 10:00", () => {
    expect(addDaytimeHours(new Date("2026-09-24T17:00:00Z"), 4).toISOString()).toBe("2026-09-25T08:00:00.000Z");
  });

  it("in inverno (UTC+1) usa comunque l'ora italiana: 23:00 → 12:00", () => {
    expect(addDaytimeHours(new Date("2026-12-10T22:00:00Z"), 4).toISOString()).toBe("2026-12-11T11:00:00.000Z");
  });
});

describe("computeDirectForwardAt (inoltro di una richiesta diretta, §208)", () => {
  it("urgente: 60 minuti, anche di giorno", () => {
    const now = new Date("2026-09-24T08:00:00Z");
    expect(computeDirectForwardAt(true, now).getTime() - now.getTime()).toBe(60 * 60_000);
  });

  it("normale: 6 ore contate dalle 8 alle 21 (19:00 → 2 ore oggi e 4 domattina → 12:00)", () => {
    expect(computeDirectForwardAt(false, new Date("2026-09-24T17:00:00Z")).toISOString()).toBe("2026-09-25T10:00:00.000Z");
  });
});
