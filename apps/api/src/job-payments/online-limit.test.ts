import { describe, expect, it, vi } from "vitest";
import { ONLINE_LIMIT_EUR_CENTS, onlineLimitCompletionProblem, onlineLimitEurCents, onlineLimitHint, onlineLimitProblem, setOnlineLimitSchema } from "@professionisti/shared";
import type { PrismaClient } from "@professionisti/database";
import { cleanOnlineJobs, professionalOnlineLimit } from "./online-limit";

/**
 * Tetto ai pagamenti online (decisione di Luca del 28/10/2026,
 * docs/changelog/2026-10-28-tetto-pagamenti-online.md): 2.000 € a lavoro
 * finché il professionista non ha 10 lavori pagati online senza
 * contestazioni e 120 giorni dal primo.
 */
const NOW = new Date("2026-10-28T12:00:00.000Z");
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 86_400_000);

function payment(over: Partial<Parameters<typeof cleanOnlineJobs>[0][number]> = {}) {
  return {
    releasedAt: daysAgo(1),
    depositPaidAt: daysAgo(10),
    createdAt: daysAgo(10),
    stripeDisputeId: null,
    stripeDisputeStatus: null,
    stripeDisputedAt: null,
    status: "CONFIRMED",
    ...over,
  };
}

describe("onlineLimitEurCents", () => {
  it("2.000 € finché non ci sono 10 lavori e 120 giorni", () => {
    expect(ONLINE_LIMIT_EUR_CENTS).toBe(200_000);
    expect(onlineLimitEurCents({ cleanJobs: 0, firstCleanJobAt: null, removedByAdmin: false, now: NOW })).toBe(200_000);
    expect(onlineLimitEurCents({ cleanJobs: 9, firstCleanJobAt: daysAgo(200), removedByAdmin: false, now: NOW })).toBe(200_000);
    expect(onlineLimitEurCents({ cleanJobs: 10, firstCleanJobAt: daysAgo(119), removedByAdmin: false, now: NOW })).toBe(200_000);
  });

  it("nessun tetto con 10 lavori e il primo di almeno 120 giorni, o se l'ha tolto l'admin", () => {
    expect(onlineLimitEurCents({ cleanJobs: 10, firstCleanJobAt: daysAgo(120), removedByAdmin: false, now: NOW })).toBeNull();
    expect(onlineLimitEurCents({ cleanJobs: 0, firstCleanJobAt: null, removedByAdmin: true, now: NOW })).toBeNull();
  });
});

describe("cleanOnlineJobs", () => {
  it("conta solo i lavori con i soldi sbloccati e senza contestazioni né rimborso totale", () => {
    const result = cleanOnlineJobs([
      payment(),
      payment({ releasedAt: null }),
      payment({ stripeDisputeId: "dp_1", stripeDisputeStatus: "won" }),
      payment({ status: "REFUNDED" }),
    ]);
    expect(result.cleanJobs).toBe(1);
  });

  it("una contestazione persa fa ripartire il conto", () => {
    const result = cleanOnlineJobs([
      payment({ depositPaidAt: daysAgo(100) }),
      payment({ depositPaidAt: daysAgo(90), stripeDisputeId: "dp_1", stripeDisputeStatus: "lost", stripeDisputedAt: daysAgo(50) }),
      payment({ depositPaidAt: daysAgo(20) }),
    ]);
    expect(result.cleanJobs).toBe(1);
    expect(result.firstCleanJobAt).toEqual(daysAgo(20));
  });
});

describe("professionalOnlineLimit", () => {
  it("legge lavori e scelta dell'admin dal database", async () => {
    const prisma = {
      professionalProfile: { findUnique: vi.fn().mockResolvedValue({ onlineLimitRemovedAt: null }) },
      jobPayment: { findMany: vi.fn().mockResolvedValue(Array.from({ length: 10 }, (_, i) => payment({ depositPaidAt: daysAgo(130 - i) }))) },
    } as unknown as PrismaClient;
    await expect(professionalOnlineLimit(prisma, "pro-1", NOW)).resolves.toMatchObject({ limitEurCents: null, cleanJobs: 10 });
  });
});

describe("onlineLimitProblem", () => {
  const base = { depositPercent: 20, limitEurCents: 200_000 };

  it("sotto il tetto va tutto bene, e senza tetto sempre", () => {
    expect(onlineLimitProblem({ ...base, paymentOptions: ["ONLINE", "DIRECT"], totalMaxEurCents: 200_000 })).toBeNull();
    expect(onlineLimitProblem({ ...base, limitEurCents: null, paymentOptions: ["ONLINE"], totalMaxEurCents: 900_000 })).toBeNull();
  });

  it("sopra il tetto con tutto online indica l'acconto online con saldo diretto", () => {
    expect(onlineLimitProblem({ ...base, paymentOptions: ["ONLINE", "DIRECT"], totalMaxEurCents: 250_000 })).toMatch(
      /^Online puoi chiedere fino a 2\.000\u00A0€ per lavoro: scegli "Acconto online e saldo diretto"/,
    );
    // Con il saldo diretto passa solo l'acconto (20% di 2.500 € = 500 €): va bene.
    expect(onlineLimitProblem({ ...base, paymentOptions: ["MIXED", "DIRECT"], totalMaxEurCents: 250_000 })).toBeNull();
  });

  it("acconto troppo alto anche col saldo diretto", () => {
    expect(onlineLimitProblem({ ...base, depositPercent: 100, paymentOptions: ["MIXED"], totalMaxEurCents: 250_000 })).toMatch(/abbassa l'acconto online/);
  });
});

describe("testi del tetto", () => {
  it("riga del modulo e frase della chiusura", () => {
    expect(onlineLimitHint(null)).toBeNull();
    expect(onlineLimitHint(200_000)).toMatch(/fino a 2\.000\u00A0€ per lavoro/);
    expect(onlineLimitCompletionProblem(200_000)).toMatch(/Indica 2\.000\u00A0€ e fatti pagare il resto direttamente/);
  });

  it("l'admin manda solo vero o falso", () => {
    expect(setOnlineLimitSchema.safeParse({ removed: true }).success).toBe(true);
    expect(setOnlineLimitSchema.safeParse({ removed: "si" }).success).toBe(false);
  });
});
