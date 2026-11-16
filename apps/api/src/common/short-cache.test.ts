import { describe, expect, it, vi } from "vitest";
import { ShortCache, summaryCacheMs } from "./short-cache";

describe("ShortCache (docs/changelog/2026-11-16-traffico-elevato.md)", () => {
  it("tiene il risultato per la durata data, poi chiede di nuovo", async () => {
    let now = 0;
    const cache = new ShortCache<number>(1000, 10, () => now);
    const load = vi.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(2);
    expect(await cache.get("a", load)).toBe(1);
    now = 999;
    expect(await cache.get("a", load)).toBe(1);
    now = 1001;
    expect(await cache.get("a", load)).toBe(2);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("chi arriva insieme aspetta la stessa domanda", async () => {
    const cache = new ShortCache<number>(1000);
    const load = vi.fn(() => new Promise<number>((resolve) => setTimeout(() => resolve(7), 5)));
    const values = await Promise.all([cache.get("a", load), cache.get("a", load), cache.get("a", load)]);
    expect(values).toEqual([7, 7, 7]);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("un errore non resta in memoria", async () => {
    const cache = new ShortCache<number>(1000);
    await expect(cache.get("a", () => Promise.reject(new Error("giù")))).rejects.toThrow("giù");
    expect(await cache.get("a", () => Promise.resolve(3))).toBe(3);
  });

  it("chiavi diverse restano separate e clear svuota", async () => {
    const cache = new ShortCache<string>(1000);
    expect(await cache.get("roma", async () => "r")).toBe("r");
    expect(await cache.get("milano", async () => "m")).toBe("m");
    cache.clear();
    expect(await cache.get("roma", async () => "r2")).toBe("r2");
  });

  it("un minuto di serie, zero solo se le prove lo chiedono", () => {
    expect(summaryCacheMs(undefined)).toBe(60_000);
    expect(summaryCacheMs("")).toBe(60_000);
    expect(summaryCacheMs("abc")).toBe(60_000);
    expect(summaryCacheMs("-5")).toBe(60_000);
    expect(summaryCacheMs("0")).toBe(0);
  });
});
