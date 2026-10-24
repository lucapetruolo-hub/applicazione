import { describe, expect, it, vi } from "vitest";

vi.mock("@sentry/nestjs", () => ({ captureMessage: vi.fn() }));

import * as Sentry from "@sentry/nestjs";
import { opsAlert } from "./ops-alert";

describe("opsAlert (§315)", () => {
  it("manda lo stesso avviso al massimo una volta l'ora", () => {
    const start = 1_000_000;
    expect(opsAlert("prova", "Google non risponde", start)).toBe(true);
    expect(opsAlert("prova", "Google non risponde", start + 10 * 60_000)).toBe(false);
    expect(opsAlert("altro", "Altro avviso", start + 10 * 60_000)).toBe(true);
    expect(opsAlert("prova", "Google non risponde", start + 61 * 60_000)).toBe(true);
    expect(Sentry.captureMessage).toHaveBeenCalledTimes(3);
  });
});
