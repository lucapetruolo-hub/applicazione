import { describe, expect, it } from "vitest";
import { SharedThrottlerStorage, setSharedHitStore, type SharedHitStore } from "./shared-throttler-storage";

function fakeStore(): SharedHitStore & { keys: string[] } {
  const counts = new Map<string, number>();
  const keys: string[] = [];
  return {
    keys,
    async hit(key) {
      keys.push(key);
      counts.set(key, (counts.get(key) ?? 0) + 1);
      return { hits: counts.get(key)!, msLeft: 42_000 };
    },
  };
}

describe("SharedThrottlerStorage", () => {
  it("conta i limiti stretti nel deposito condiviso, uguale per due copie dell'API", async () => {
    const store = fakeStore();
    setSharedHitStore(store);
    const copiaA = new SharedThrottlerStorage();
    const copiaB = new SharedThrottlerStorage();
    await copiaA.increment("login|1.2.3.4", 60_000, 2, 60_000, "default");
    await copiaB.increment("login|1.2.3.4", 60_000, 2, 60_000, "default");
    const third = await copiaA.increment("login|1.2.3.4", 60_000, 2, 60_000, "default");
    expect(third).toEqual({ totalHits: 3, timeToExpire: 42, isBlocked: true, timeToBlockExpire: 42 });
    expect(store.keys[0]).not.toContain("1.2.3.4");
  });

  it("il limite generale resta in memoria", async () => {
    const store = fakeStore();
    setSharedHitStore(store);
    const record = await new SharedThrottlerStorage().increment("ricerca|1.2.3.4", 60_000, 60, 60_000, "default");
    expect(record.totalHits).toBe(1);
    expect(store.keys).toHaveLength(0);
  });

  it("se il database non risponde conta in memoria, senza bloccare", async () => {
    setSharedHitStore({ hit: async () => Promise.reject(new Error("giù")) });
    const record = await new SharedThrottlerStorage().increment("login|1.2.3.4", 60_000, 10, 60_000, "default");
    expect(record.totalHits).toBe(1);
    expect(record.isBlocked).toBe(false);
  });
});
