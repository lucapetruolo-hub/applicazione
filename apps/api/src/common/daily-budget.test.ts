import { afterEach, describe, expect, it, vi } from "vitest";
import { DailyBudget, MemoryBudgetStore } from "./daily-budget";

/** Tetto giornaliero alle chiamate a Google dalle rotte pubbliche (§293). */
describe("DailyBudget", () => {
  afterEach(() => {
    delete process.env.GOOGLE_PUBLIC_DAILY_LIMIT;
  });

  it("ferma le chiamate oltre il tetto e avvisa una volta sola", async () => {
    const onExhausted = vi.fn();
    const budget = new DailyBudget(2, onExhausted);
    const day = new Date("2026-10-24T10:00:00Z");
    expect([await budget.take(day), await budget.take(day), await budget.take(day), await budget.take(day)]).toEqual([true, true, false, false]);
    expect(onExhausted).toHaveBeenCalledTimes(1);
  });

  it("riparte il giorno dopo", async () => {
    const budget = new DailyBudget(1);
    expect(await budget.take(new Date("2026-10-24T23:59:00Z"))).toBe(true);
    expect(await budget.take(new Date("2026-10-24T23:59:30Z"))).toBe(false);
    expect(await budget.take(new Date("2026-10-25T00:00:10Z"))).toBe(true);
  });

  it("usa GOOGLE_PUBLIC_DAILY_LIMIT se impostata", async () => {
    process.env.GOOGLE_PUBLIC_DAILY_LIMIT = "0";
    expect(await new DailyBudget(100).take()).toBe(false);
  });

  it("hasRoom guarda senza contare", async () => {
    const budget = new DailyBudget(1);
    const day = new Date("2026-10-24T10:00:00Z");
    expect(await budget.hasRoom(day)).toBe(true);
    expect(await budget.hasRoom(day)).toBe(true);
    expect(await budget.take(day)).toBe(true);
    expect(await budget.hasRoom(day)).toBe(false);
    expect(await budget.hasRoom(new Date("2026-10-25T00:00:10Z"))).toBe(true);
  });

  it("con un nome conta nel deposito condiviso, uguale per tutte le copie (docs/changelog/2026-11-16-traffico-elevato.md)", async () => {
    const store = new MemoryBudgetStore();
    const day = new Date("2026-11-16T10:00:00Z");
    const first = new DailyBudget(2, undefined, "PROVA_TETTO", "prova", store);
    const second = new DailyBudget(2, undefined, "PROVA_TETTO", "prova", store);
    expect([await first.take(day), await second.take(day), await first.take(day)]).toEqual([true, true, false]);
    expect(await second.usage(day)).toEqual({ used: 2, limit: 2 });
  });

  it("avvisa una volta quando si arriva all'80% del tetto", async () => {
    const nearly = vi.fn();
    const budget = new DailyBudget(10, undefined, "PROVA_TETTO", "prova", new MemoryBudgetStore(), nearly);
    const day = new Date("2026-11-16T10:00:00Z");
    for (let i = 0; i < 7; i++) await budget.take(day);
    expect(nearly).not.toHaveBeenCalled();
    await budget.take(day);
    await budget.take(day);
    expect(nearly).toHaveBeenCalledTimes(1);
    expect(nearly).toHaveBeenCalledWith(8, 10);
  });

  it("se il deposito non risponde la chiamata a pagamento non parte", async () => {
    const broken = { take: vi.fn().mockRejectedValue(new Error("giù")), used: vi.fn().mockRejectedValue(new Error("giù")) };
    const budget = new DailyBudget(5, undefined, "PROVA_TETTO", "prova", broken);
    expect(await budget.take()).toBe(false);
    expect(await budget.hasRoom()).toBe(false);
  });
});
