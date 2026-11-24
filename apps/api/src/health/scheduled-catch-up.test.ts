import { CronTime } from "cron";
import { afterEach, describe, expect, it, vi } from "vitest";
import { catchUpJobs, lastExpectedSlot, type CatchUpJob } from "../common/scheduled-job";
import { lateReason, ScheduledCatchUpService } from "./scheduled-catch-up.service";

const DAY = 24 * 60 * 60_000;

function nextOf(expr: string): (from: Date) => Date {
  const time = new CronTime(expr, "Europe/Rome");
  return (from) => time.getNextDateFrom(from, "Europe/Rome").toJSDate();
}

class FintoServizio {}

type Run = { name: string; slot: Date; startedAt: Date; finishedAt: Date | null; error: string | null };

function setup(expr: string, rows: Run[], job: Partial<CatchUpJob> = {}) {
  const instance = new FintoServizio();
  const run = vi.fn(async (_instance: unknown, slot: Date) => {
    rows.push({ name: "FintoServizio.giro", slot, startedAt: slot, finishedAt: slot, error: null });
    return "done" as const;
  });
  const entry: CatchUpJob = { name: "FintoServizio.giro", owner: FintoServizio, withinMs: 10 * DAY, run, ...job };
  catchUpJobs.push(entry);
  const prisma = {
    cronRun: {
      findFirst: async ({ where }: { where: { name: string; slot: { gte: Date } } }) =>
        rows.filter((r) => r.name === where.name && r.slot >= where.slot.gte).sort((a, b) => b.slot.getTime() - a.slot.getTime())[0] ?? null,
    },
  };
  const discovery = { getProviders: () => [{ metatype: FintoServizio, instance }] };
  const time = new CronTime(expr, "Europe/Rome");
  const registry = { getCronJob: () => ({ cronTime: time }) };
  const service = new ScheduledCatchUpService(prisma as never, discovery as never, registry as never);
  return { service, run, instance };
}

afterEach(() => {
  catchUpJobs.length = 0;
});

describe("Ultimo orario previsto", () => {
  it("zip del 5 alle 9: il 7 dicembre è il 5 dicembre alle 9 di Roma", () => {
    expect(lastExpectedSlot(nextOf("0 9 5 * *"), new Date("2026-12-07T10:00:00Z"), 10 * DAY)?.toISOString()).toBe("2026-12-05T08:00:00.000Z");
  });

  it("fuori dalla finestra non c'è nulla da recuperare", () => {
    expect(lastExpectedSlot(nextOf("0 9 5 * *"), new Date("2026-12-20T10:00:00Z"), 10 * DAY)).toBeNull();
  });

  it("ogni ora: l'ultimo è quello appena passato", () => {
    expect(lastExpectedSlot(nextOf("20 * * * *"), new Date("2026-12-07T10:45:00Z"), 2 * 60 * 60_000)?.toISOString()).toBe("2026-12-07T10:20:00.000Z");
  });
});

describe("Recupero all'avvio", () => {
  it("API spenta il 5 alle 9: il giro parte al risveglio, con l'orario previsto", async () => {
    const { service, run, instance } = setup("0 9 5 * *", []);
    expect(await service.catchUp(new Date("2026-12-06T07:30:00Z"))).toEqual(["FintoServizio.giro"]);
    expect(run).toHaveBeenCalledWith(instance, new Date("2026-12-05T08:00:00Z"));
  });

  it("giro già fatto: non si ripete", async () => {
    const slot = new Date("2026-12-05T08:00:00Z");
    const { service, run } = setup("0 9 5 * *", [{ name: "FintoServizio.giro", slot, startedAt: slot, finishedAt: slot, error: null }]);
    expect(await service.catchUp(new Date("2026-12-06T07:30:00Z"))).toEqual([]);
    expect(run).not.toHaveBeenCalled();
  });

  it("un recupero che fallisce non ferma gli altri", async () => {
    const { service } = setup("0 9 5 * *", [], { run: async () => Promise.reject(new Error("rotto")) });
    await expect(service.catchUp(new Date("2026-12-06T07:30:00Z"))).resolves.toEqual([]);
  });
});

describe("Controllo uomo morto", () => {
  it("giro mancato e non recuperato: in ritardo", async () => {
    const { service } = setup("0 9 5 * *", []);
    const late = await service.lateJobs(new Date("2026-12-05T10:00:00Z"));
    expect(late).toEqual([{ job: "FintoServizio.giro", expected: "2026-12-05T08:00:00.000Z", why: "non partita" }]);
  });

  it("appena previsto: ancora in partenza, non è in ritardo", async () => {
    const { service } = setup("0 9 5 * *", []);
    expect(await service.lateJobs(new Date("2026-12-05T08:05:00Z"))).toEqual([]);
  });

  it("finito con un errore più di due giorni fa: non tiene più rosso il controllo", async () => {
    const slot = new Date("2026-12-05T08:00:00Z");
    const { service } = setup("0 9 5 * *", [{ name: "FintoServizio.giro", slot, startedAt: slot, finishedAt: slot, error: "rotto" }]);
    expect(await service.lateJobs(new Date("2026-12-06T08:00:00Z"))).toHaveLength(1);
    expect(await service.lateJobs(new Date("2026-12-08T08:00:00Z"))).toEqual([]);
  });

  it("motivi", () => {
    const now = new Date("2026-12-05T12:00:00Z");
    expect(lateReason(null, now)).toBe("non partita");
    expect(lateReason({ startedAt: now, finishedAt: now, error: "x" }, now)).toBe("finita con un errore");
    expect(lateReason({ startedAt: new Date("2026-12-05T08:00:00Z"), finishedAt: null, error: null }, now)).toBe("ferma a metà");
    expect(lateReason({ startedAt: new Date("2026-12-05T11:50:00Z"), finishedAt: null, error: null }, now)).toBeNull();
  });
});
