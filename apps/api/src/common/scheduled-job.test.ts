import { describe, expect, it, vi } from "vitest";
import { cronSlot, runScheduled, ScheduledJob, type CronRunStore } from "./scheduled-job";

function memoryStore() {
  const rows = new Map<string, { finished: boolean; error: string | null }>();
  const store: CronRunStore = {
    async claim(name, slot) {
      const key = `${name}@${slot.toISOString()}`;
      if (rows.has(key)) return false;
      rows.set(key, { finished: false, error: null });
      return true;
    },
    async finish(name, slot, error) {
      rows.set(`${name}@${slot.toISOString()}`, { finished: true, error });
    },
  };
  return { store, rows };
}

describe("Attività a orario", () => {
  it("due API nello stesso minuto: il giro parte una volta sola", async () => {
    const { store } = memoryStore();
    const job = vi.fn(async () => undefined);
    const results = await Promise.all([
      runScheduled("Prova.giro", new Date("2026-12-01T06:00:00.120Z"), job, store),
      runScheduled("Prova.giro", new Date("2026-12-01T06:00:02.900Z"), job, store),
    ]);
    expect(results.sort()).toEqual(["done", "skipped"]);
    expect(job).toHaveBeenCalledTimes(1);
  });

  it("il minuto dopo è un giro nuovo", async () => {
    const { store } = memoryStore();
    const job = vi.fn(async () => undefined);
    await runScheduled("Prova.giro", new Date("2026-12-01T06:00:10Z"), job, store);
    await runScheduled("Prova.giro", new Date("2026-12-01T06:01:10Z"), job, store);
    expect(job).toHaveBeenCalledTimes(2);
  });

  it("un errore resta segnato sulla riga e arriva ai log di Nest", async () => {
    const { store, rows } = memoryStore();
    await expect(runScheduled("Prova.giro", new Date("2026-12-01T06:00:00Z"), () => Promise.reject(new Error("database giù")), store)).rejects.toThrow("database giù");
    expect([...rows.values()]).toEqual([{ finished: true, error: "database giù" }]);
  });

  it("il minuto si arrotonda per difetto", () => {
    expect(cronSlot(new Date("2026-12-01T06:00:59.999Z")).toISOString()).toBe("2026-12-01T06:00:00.000Z");
  });

  it("il metodo del servizio resta quello di prima: lo chiamano le prove e Admin", async () => {
    class Servizio {
      calls: unknown[] = [];
      @ScheduledJob("0 9 * * *")
      async giro(now: Date = new Date()) {
        this.calls.push(now);
        return 7;
      }
    }
    const s = new Servizio();
    expect(await s.giro(new Date("2026-01-01T00:00:00Z"))).toBe(7);
    expect(Object.getOwnPropertyNames(Servizio.prototype)).toContain("giro__aOrario");
    // Il giro a orario ha l'ora italiana di serie e non si accavalla.
    const options = Reflect.getMetadata("SCHEDULE_CRON_OPTIONS", (Servizio.prototype as unknown as Record<string, object>).giro__aOrario as object);
    expect(options).toMatchObject({ cronTime: "0 9 * * *", timeZone: "Europe/Rome", waitForCompletion: true, name: "Servizio.giro" });
    expect(Reflect.getMetadata("SCHEDULE_CRON_OPTIONS", Servizio.prototype.giro)).toBeUndefined();
  });
});
