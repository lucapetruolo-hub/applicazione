import { describe, expect, it, vi } from "vitest";
import { SiteHealthService, pageOutcome, paymentsOutcome, scheduledJobsOutcome } from "./site-health.service";

/** Scadenze del sito e controllo della notte (docs/changelog/2026-11-13-admin-scadenze-controlli.md). */
const now = new Date("2026-11-20T03:00:00Z");
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000);
const okFetch = (async () => new Response("ok", { status: 200 })) as unknown as typeof fetch;

describe("controllo della notte", () => {
  it("una pagina che risponde 200 va bene, un errore o niente risposta no", async () => {
    expect(await pageOutcome("https://sito.test/", okFetch)).toBeNull();
    const down = await pageOutcome("https://sito.test/", (async () => new Response("", { status: 503 })) as unknown as typeof fetch);
    expect(down?.problem).toContain("errore");
    expect(down?.techNote).toContain("503");
    const offline = await pageOutcome("https://sito.test/", (async () => {
      throw new Error("ECONNREFUSED");
    }) as unknown as typeof fetch);
    expect(offline?.problem).toContain("non risponde");
  });

  it("i lavori automatici: errore o fermo da più di 2 ore, senza contare se stesso", () => {
    const self = "SiteHealthService.nightlyCheck";
    expect(scheduledJobsOutcome([{ name: "A.uno", startedAt: hoursAgo(5), finishedAt: hoursAgo(5), error: null }], now, self)).toBeNull();
    expect(scheduledJobsOutcome([{ name: self, startedAt: hoursAgo(5), finishedAt: null, error: "x" }], now, self)).toBeNull();
    const one = scheduledJobsOutcome([{ name: "A.uno", startedAt: hoursAgo(5), finishedAt: hoursAgo(5), error: "timeout" }], now, self);
    expect(one?.problem).toContain("Un lavoro automatico");
    expect(one?.techNote).toContain("A.uno: timeout");
    const two = scheduledJobsOutcome(
      [
        { name: "A.uno", startedAt: hoursAgo(5), finishedAt: hoursAgo(5), error: "timeout" },
        { name: "B.due", startedAt: hoursAgo(3), finishedAt: null, error: null },
        { name: "C.tre", startedAt: hoursAgo(1), finishedAt: null, error: null },
      ],
      now,
      self,
    );
    expect(two?.problem).toContain("2 lavori automatici");
  });

  it("notizie dei pagamenti: solo con i pagamenti accesi, avviso dopo 7 giorni di silenzio", () => {
    expect(paymentsOutcome(null, now, false)).toBeNull();
    expect(paymentsOutcome(hoursAgo(24), now, true)).toBeNull();
    expect(paymentsOutcome(hoursAgo(8 * 24), now, true)?.problem).toContain("7 giorni");
    expect(paymentsOutcome(null, now, true)?.techNote).toContain("mai");
  });

  it("salva l'esito e tiene la data del primo errore finché il problema resta", async () => {
    const saved = new Map<string, { failingSince: Date | null; ok: boolean }>([["SEARCH_PAGE", { failingSince: hoursAgo(48), ok: false }]]);
    const prisma = {
      cronRun: { findMany: vi.fn(async () => []) },
      stripeWebhookEvent: { findFirst: vi.fn(async () => null) },
      siteCheck: {
        findUnique: vi.fn(async ({ where }: { where: { key: string } }) => saved.get(where.key) ?? null),
        upsert: vi.fn(async ({ where, update }: { where: { key: string }; update: { failingSince: Date | null; ok: boolean } }) => {
          saved.set(where.key, update);
        }),
      },
    };
    const fetcher = (async (url: string) => new Response("", { status: String(url).endsWith("/cerca") ? 500 : 200 })) as unknown as typeof fetch;
    const service = new SiteHealthService(prisma as never, { record: vi.fn() } as never);
    const outcomes = await service.nightlyCheck(now, fetcher);
    expect(outcomes.SITE).toBeNull();
    expect(outcomes.SEARCH_PAGE).not.toBeNull();
    expect(saved.get("SITE")).toMatchObject({ ok: true, failingSince: null });
    expect(saved.get("SEARCH_PAGE")).toMatchObject({ ok: false, failingSince: hoursAgo(48) });
  });
});
