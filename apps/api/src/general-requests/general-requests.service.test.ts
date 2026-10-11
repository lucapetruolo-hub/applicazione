import { afterEach, describe, expect, it, vi } from "vitest";
import { generalRequestCloseReason, responseRate, weeklyPerProfessional, type GeneralRequestLoad } from "@professionisti/shared";
import { GeneralRequestsService } from "./general-requests.service";

/** Chiusura automatica delle richieste generali per categoria e città (docs/CHANGELOG.md §210). */

const NOW = new Date("2026-10-11T12:00:00Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000);

function load(partial: Partial<GeneralRequestLoad>): GeneralRequestLoad {
  return { leads: 0, professionals: 0, requests: 0, measuredLeads: 0, respondedLeads: 0, ...partial };
}

describe("soglie delle richieste generali", () => {
  it("calcola le richieste a settimana per professionista sui 14 giorni", () => {
    expect(weeklyPerProfessional(load({ leads: 40, professionals: 2 }))).toBe(10);
    expect(weeklyPerProfessional(load({ leads: 5, professionals: 0 }))).toBe(0);
  });

  it("non misura le risposte finché le richieste sono meno di 20", () => {
    expect(responseRate(load({ measuredLeads: 19, respondedLeads: 0 }))).toBeNull();
    expect(responseRate(load({ measuredLeads: 20, respondedLeads: 5 }))).toBe(0.25);
  });

  it("chiude oltre 10 richieste a settimana per professionista", () => {
    expect(generalRequestCloseReason(load({ leads: 40, professionals: 2 }))).toBeNull();
    expect(generalRequestCloseReason(load({ leads: 42, professionals: 2 }))).toContain("10,5");
  });

  it("chiude se risponde meno di un professionista su tre", () => {
    expect(generalRequestCloseReason(load({ leads: 20, professionals: 10, measuredLeads: 20, respondedLeads: 7 }))).toBeNull();
    expect(generalRequestCloseReason(load({ leads: 20, professionals: 10, measuredLeads: 20, respondedLeads: 6 }))).toContain("30%");
  });
});

function buildService(opts: { leads: unknown[]; blocks?: unknown[]; quotes?: unknown[] }) {
  const prisma = {
    lead: { findMany: vi.fn().mockResolvedValue(opts.leads) },
    quote: { findMany: vi.fn().mockResolvedValue(opts.quotes ?? []) },
    conversationEvent: { findMany: vi.fn().mockResolvedValue([]) },
    generalRequestBlock: {
      findMany: vi.fn().mockResolvedValue(opts.blocks ?? []),
      findUnique: vi.fn().mockResolvedValue(null),
      upsert: vi.fn().mockResolvedValue({ id: "block-1" }),
    },
  };
  const audit = { record: vi.fn() };
  const service = new GeneralRequestsService(prisma as never, audit as never);
  return { service, prisma, audit };
}

/** 22 richieste a 1 solo professionista in 14 giorni: 11 a settimana, sopra il limite. */
function overloadedLeads() {
  return Array.from({ length: 22 }, (_, i) => ({
    guidedRequestId: `req-${i}`,
    professionalProfileId: "pro-1",
    createdAt: hoursAgo(1),
    guidedRequest: { categoryId: "cat-1", city: " Milano " },
  }));
}

describe("GeneralRequestsService.runAutoCheck", () => {
  it("chiude la categoria nella città sovraccarica e lo registra", async () => {
    const { service, prisma, audit } = buildService({ leads: overloadedLeads() });
    expect(await service.runAutoCheck(NOW)).toBe(1);
    expect(prisma.generalRequestBlock.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { categoryId_city: { categoryId: "cat-1", city: "Milano" } } }),
    );
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ entityType: "GeneralRequestBlock", newValue: "CLOSED" }));
  });

  it("non tocca una zona già chiusa", async () => {
    const { service, prisma } = buildService({
      leads: overloadedLeads(),
      blocks: [{ categoryId: "cat-1", city: "Milano", reopenedAt: null, keepOpenUntil: null }],
    });
    expect(await service.runAutoCheck(NOW)).toBe(0);
    expect(prisma.generalRequestBlock.upsert).not.toHaveBeenCalled();
  });

  it("non richiude una zona riaperta a mano da meno di 30 giorni", async () => {
    const { service, prisma } = buildService({
      leads: overloadedLeads(),
      blocks: [{ categoryId: "cat-1", city: "Milano", reopenedAt: hoursAgo(24), keepOpenUntil: new Date(NOW.getTime() + 86_400_000) }],
    });
    expect(await service.runAutoCheck(NOW)).toBe(0);
    expect(prisma.generalRequestBlock.upsert).not.toHaveBeenCalled();
  });

  it("conta come risposte solo le richieste arrivate da almeno 48 ore", async () => {
    const leads = Array.from({ length: 20 }, (_, i) => ({
      guidedRequestId: `req-${i}`,
      professionalProfileId: `pro-${i % 10}`,
      createdAt: i < 10 ? hoursAgo(72) : hoursAgo(10),
      guidedRequest: { categoryId: "cat-1", city: "Milano" },
    }));
    const { service } = buildService({ leads, quotes: [{ guidedRequestId: "req-0", professionalProfileId: "pro-0" }] });
    const zone = [...(await service.computeLoads(NOW)).values()][0];
    expect(zone?.load).toEqual({ leads: 20, professionals: 10, requests: 20, measuredLeads: 10, respondedLeads: 1 });
  });
});

describe("GeneralRequestsService.availability", () => {
  afterEach(() => {
    delete process.env.GENERAL_REQUESTS_ENABLED;
  });

  it("le spegne ovunque con GENERAL_REQUESTS_ENABLED=false", async () => {
    process.env.GENERAL_REQUESTS_ENABLED = "false";
    const { service } = buildService({ leads: [] });
    expect(await service.availability("cat-1", "Milano")).toEqual({ open: false, closedScope: "GLOBAL" });
  });

  it("le chiude solo nella zona bloccata", async () => {
    const { service, prisma } = buildService({ leads: [] });
    prisma.generalRequestBlock.findUnique.mockResolvedValueOnce({ reopenedAt: null });
    expect(await service.availability("cat-1", "Milano")).toEqual({ open: false, closedScope: "ZONE" });
    expect(await service.availability("cat-1", "Roma")).toEqual({ open: true, closedScope: null });
  });
});
