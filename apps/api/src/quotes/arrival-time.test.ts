import { describe, expect, it } from "vitest";
import { arrivalTimeProblem } from "./arrival-time";

const start = "2026-11-20T08:00:00.000Z";
const end = "2026-11-20T19:00:00.000Z";

describe("arrivalTimeProblem (docs/changelog/2026-11-11-fasce-ampie.md)", () => {
  it("accetta un'ora dentro la fascia, anche l'inizio", () => {
    expect(arrivalTimeProblem(start, end, "10:00")).toBeNull();
    expect(arrivalTimeProblem(start, end, "08:00")).toBeNull();
    expect(arrivalTimeProblem(start, end, null)).toBeNull();
    expect(arrivalTimeProblem(start, end, undefined)).toBeNull();
  });

  it("rifiuta un'ora fuori dalla fascia o alla sua fine", () => {
    expect(arrivalTimeProblem(start, end, "07:30")).not.toBeNull();
    expect(arrivalTimeProblem(start, end, "19:00")).not.toBeNull();
  });

  it("serve una fascia con l'ora di fine", () => {
    expect(arrivalTimeProblem(start, undefined, "10:00")).not.toBeNull();
  });

  it("lavoro su più giorni: conta solo l'inizio del primo giorno", () => {
    expect(arrivalTimeProblem(start, "2026-11-21T12:00:00.000Z", "15:00")).toBeNull();
    expect(arrivalTimeProblem(start, "2026-11-21T12:00:00.000Z", "07:00")).not.toBeNull();
  });
});
