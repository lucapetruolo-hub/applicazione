import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_GENERAL_REQUEST_THRESHOLDS,
  generalRequestCloseReason,
  generalRequestReopenSuggestion,
  responseRate,
  weeklyPerProfessional,
  type GeneralRequestLoad,
} from "@professionisti/shared";
import { GeneralRequestsService } from "./general-requests.service";

/** Chiusura automatica delle richieste generali per categoria e città (docs/CHANGELOG.md §211). */

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

  it("con 0% di risposte minime non controlla le risposte", () => {
    const thresholds = { autoCloseEnabled: true, maxWeeklyPerPro: 10, minResponsePercent: 0, minMeasuredLeads: 20, keepOpenDays: 30 };
    expect(generalRequestCloseReason(load({ leads: 20, professionals: 10, measuredLeads: 20, respondedLeads: 0 }), thresholds)).toBeNull();
  });

  it("chiude se risponde meno di un professionista su tre", () => {
    expect(generalRequestCloseReason(load({ leads: 20, professionals: 10, measuredLeads: 20, respondedLeads: 7 }))).toBeNull();
    expect(generalRequestCloseReason(load({ leads: 20, professionals: 10, measuredLeads: 20, respondedLeads: 6 }))).toContain("30%");
  });
});

function buildService(opts: { leads: unknown[]; blocks?: unknown[]; quotes?: unknown[]; settings?: unknown }) {
  const prisma = {
    lead: { findMany: vi.fn().mockResolvedValue(opts.leads) },
    quote: { findMany: vi.fn().mockResolvedValue(opts.quotes ?? []) },
    conversationEvent: { findMany: vi.fn().mockResolvedValue([]) },
    generalRequestBlock: {
      findMany: vi.fn().mockResolvedValue(opts.blocks ?? []),
      findUnique: vi.fn().mockResolvedValue(null),
      upsert: vi.fn().mockResolvedValue({ id: "block-1" }),
    },
    generalRequestSettings: { findFirst: vi.fn().mockResolvedValue(opts.settings ?? null) },
    user: { findMany: vi.fn().mockResolvedValue([{ email: "mod@example.com" }]) },
    category: { findMany: vi.fn().mockResolvedValue([{ id: "cat-1", label: "Idraulico" }]) },
  };
  const audit = { record: vi.fn() };
  const email = { send: vi.fn().mockResolvedValue(true) };
  const service = new GeneralRequestsService(prisma as never, audit as never, email as never);
  return { service, prisma, audit, email };
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
    expect(prisma.generalRequestBlock.upsert).toHaveBeenCalledWith(expect.objectContaining({ create: expect.objectContaining({ closeTrigger: "LOAD" }) }));
  });

  it("avvisa per email gli admin di moderazione", async () => {
    const { service, email } = buildService({ leads: overloadedLeads() });
    await service.runAutoCheck(NOW);
    expect(email.send).toHaveBeenCalledWith(expect.objectContaining({ to: "mod@example.com", subject: "Richieste generali chiuse: Idraulico a Milano" }));
  });

  it("non chiude nulla con la chiusura automatica spenta", async () => {
    const settings = { autoCloseEnabled: false, maxWeeklyPerPro: 10, minResponsePercent: 33, minMeasuredLeads: 20, keepOpenDays: 30 };
    const { service, prisma, email } = buildService({ leads: overloadedLeads(), settings });
    expect(await service.runAutoCheck(NOW)).toBe(0);
    expect(prisma.generalRequestBlock.upsert).not.toHaveBeenCalled();
    expect(email.send).not.toHaveBeenCalled();
  });

  it("usa le soglie salvate dall'admin", async () => {
    const settings = { autoCloseEnabled: true, maxWeeklyPerPro: 12, minResponsePercent: 33, minMeasuredLeads: 20, keepOpenDays: 30 };
    const { service } = buildService({ leads: overloadedLeads(), settings });
    expect(await service.runAutoCheck(NOW)).toBe(0);
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

describe("proposta di riapertura", () => {
  const thresholds = DEFAULT_GENERAL_REQUEST_THRESHOLDS;

  it("non propone nulla per una zona chiusa a mano o da meno di 7 giorni", () => {
    expect(generalRequestReopenSuggestion({ trigger: "MANUAL", daysClosed: 60, directRequestsSinceClose: 0, thresholds })).toBeNull();
    expect(generalRequestReopenSuggestion({ trigger: "LOAD", daysClosed: 6, directRequestsSinceClose: 0, thresholds })).toBeNull();
  });

  it("chiusa per troppe richieste: propone di riaprire se la domanda è scesa sotto il limite", () => {
    expect(generalRequestReopenSuggestion({ trigger: "LOAD", daysClosed: 14, directRequestsSinceClose: 30, thresholds })).toBeNull();
    expect(generalRequestReopenSuggestion({ trigger: "LOAD", daysClosed: 14, directRequestsSinceClose: 12, thresholds })).toContain("circa 6 richieste");
  });

  it("chiusa per poche risposte: propone di riprovare dopo 30 giorni", () => {
    expect(generalRequestReopenSuggestion({ trigger: "RESPONSES", daysClosed: 20, directRequestsSinceClose: 0, thresholds })).toBeNull();
    expect(generalRequestReopenSuggestion({ trigger: "RESPONSES", daysClosed: 31, directRequestsSinceClose: 0, thresholds })).toContain("31 giorni");
  });
});
