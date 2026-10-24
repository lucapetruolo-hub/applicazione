import { afterEach, describe, expect, it, vi } from "vitest";
import { DailyBudget } from "./daily-budget";

/** Tetto giornaliero alle chiamate a Google dalle rotte pubbliche (§293). */
describe("DailyBudget", () => {
  afterEach(() => {
    delete process.env.GOOGLE_PUBLIC_DAILY_LIMIT;
  });

  it("ferma le chiamate oltre il tetto e avvisa una volta sola", () => {
    const onExhausted = vi.fn();
    const budget = new DailyBudget(2, onExhausted);
    const day = new Date("2026-10-24T10:00:00Z");
    expect([budget.take(day), budget.take(day), budget.take(day), budget.take(day)]).toEqual([true, true, false, false]);
    expect(onExhausted).toHaveBeenCalledTimes(1);
  });

  it("riparte il giorno dopo", () => {
    const budget = new DailyBudget(1);
    expect(budget.take(new Date("2026-10-24T23:59:00Z"))).toBe(true);
    expect(budget.take(new Date("2026-10-24T23:59:30Z"))).toBe(false);
    expect(budget.take(new Date("2026-10-25T00:00:10Z"))).toBe(true);
  });

  it("usa GOOGLE_PUBLIC_DAILY_LIMIT se impostata", () => {
    process.env.GOOGLE_PUBLIC_DAILY_LIMIT = "0";
    expect(new DailyBudget(100).take()).toBe(false);
  });
});
