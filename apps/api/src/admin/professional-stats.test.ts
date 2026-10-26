import { describe, expect, it } from "vitest";
import { sharePercentLabel } from "@professionisti/shared";
import { buildProfessionalStats, professionalPlanOf, professionalStatusOf, type ProfessionalStatsRow } from "./professional-stats";

const NOW = new Date("2026-10-26T12:00:00Z");

const row = (overrides: Partial<ProfessionalStatsRow> = {}): ProfessionalStatsRow => ({
  city: "Latina",
  createdAt: new Date("2026-10-20T10:00:00Z"),
  suspendedAt: null,
  pausedAt: null,
  invitePendingAt: null,
  requestsBlockedUntil: null,
  isDemo: false,
  categorySlugs: ["idraulico"],
  user: { suspendedAt: null },
  fiscalProfile: { entityType: "SOLE_PROPRIETOR", fiscalDataCompleteAt: new Date("2026-10-20T10:00:00Z") },
  subscription: { plan: "FREE", status: "TRIALING", trialEndsAt: new Date("2026-11-20T00:00:00Z"), founderNumber: null },
  ...overrides,
});

describe("Professionisti in numeri (§368)", () => {
  it("un solo stato per professionista, la sospensione prima di tutto", () => {
    expect(professionalStatusOf(row(), NOW)).toBe("VISIBLE");
    expect(professionalStatusOf(row({ pausedAt: NOW, user: { suspendedAt: NOW } }), NOW)).toBe("SUSPENDED");
    expect(professionalStatusOf(row({ requestsBlockedUntil: new Date("2026-11-01T00:00:00Z") }), NOW)).toBe("BLOCKED");
    expect(professionalStatusOf(row({ requestsBlockedUntil: new Date("2026-10-01T00:00:00Z") }), NOW)).toBe("VISIBLE");
    expect(professionalStatusOf(row({ invitePendingAt: NOW, pausedAt: NOW }), NOW)).toBe("INVITE_PENDING");
    expect(professionalStatusOf(row({ pausedAt: NOW }), NOW)).toBe("PAUSED");
  });

  it("abbonamento: prova, offerta di lancio, livello pagato, nessuno", () => {
    expect(professionalPlanOf(row(), NOW)).toBe("TRIAL");
    expect(professionalPlanOf(row({ subscription: { plan: "FREE", status: "TRIALING", trialEndsAt: new Date("2027-01-01T00:00:00Z"), founderNumber: 7 } }), NOW)).toBe(
      "FOUNDER",
    );
    expect(professionalPlanOf(row({ subscription: { plan: "PLUS", status: "ACTIVE", trialEndsAt: null } }), NOW)).toBe("PLUS");
    expect(professionalPlanOf(row({ subscription: { plan: "BUSINESS", status: "PAST_DUE", trialEndsAt: null } }), NOW)).toBe("PRO");
    expect(professionalPlanOf(row({ subscription: { plan: "FREE", status: "TRIALING", trialEndsAt: new Date("2026-10-01T00:00:00Z") } }), NOW)).toBe("NONE");
    expect(professionalPlanOf(row({ subscription: null }), NOW)).toBe("NONE");
  });

  it("conta categorie (fino a 3 per professionista), città, forme e mesi", () => {
    const stats = buildProfessionalStats(
      [
        row({ categorySlugs: ["idraulico", "elettricista"] }),
        row({ city: "Roma", categorySlugs: ["idraulico"], fiscalProfile: null, createdAt: new Date("2026-05-03T10:00:00Z") }),
        row({ city: "Latina", categorySlugs: ["pulizie", "pulizie"], fiscalProfile: { entityType: "PRIVATE_INDIVIDUAL", fiscalDataCompleteAt: null } }),
      ],
      NOW,
      { cityOptions: ["Latina", "Roma"], excluded: { deleted: 2, demo: 1 } },
    );
    expect(stats.total).toBe(3);
    expect(stats.new30d).toBe(2);
    expect(stats.excluded).toEqual({ deleted: 2, demo: 1 });
    expect(stats.byCategory.slice(0, 3)).toEqual([
      { slug: "idraulico", label: "Idraulico", count: 2 },
      { slug: "elettricista", label: "Elettricista", count: 1 },
      { slug: "pulizie", label: "Pulizie", count: 1 },
    ]);
    expect(stats.byCategory.every((c) => c.count >= 0)).toBe(true);
    expect(stats.byCity).toEqual([
      { city: "Latina", count: 2 },
      { city: "Roma", count: 1 },
    ]);
    expect(stats.byEntity).toEqual([
      { key: "PRIVATE_INDIVIDUAL", count: 1 },
      { key: "SOLE_PROPRIETOR", count: 1 },
      { key: "BUSINESS", count: 0 },
      { key: "UNKNOWN", count: 1 },
    ]);
    expect(stats.byStatus.reduce((sum, s) => sum + s.count, 0)).toBe(3);
    // Da gennaio dell'anno degli ultimi 12 mesi (2025) a ottobre 2026.
    expect(stats.byMonth).toHaveLength(22);
    expect(stats.byMonth[0]).toEqual({ key: "2025-01", count: 0 });
    expect(stats.byMonth.at(-1)).toEqual({ key: "2026-10", count: 2 });
    expect(stats.byMonth.find((m) => m.key === "2026-05")?.count).toBe(1);
  });

  it("mesi dal primo anno con iscrizioni, per scegliere un anno nel grafico", () => {
    const stats = buildProfessionalStats([row({ createdAt: new Date("2023-06-10T10:00:00Z") })], NOW, { cityOptions: [], excluded: { deleted: 0, demo: 0 } });
    expect(stats.byMonth[0]).toEqual({ key: "2023-01", count: 0 });
    expect(stats.byMonth.find((m) => m.key === "2023-06")?.count).toBe(1);
    expect(stats.byMonth.at(-1)?.key).toBe("2026-10");
    expect(stats.byMonth).toHaveLength(12 * 3 + 10);
  });

  it("percentuali leggibili", () => {
    expect(sharePercentLabel(1, 3)).toBe("33%");
    expect(sharePercentLabel(1, 300)).toBe("<1%");
    expect(sharePercentLabel(0, 3)).toBe("0%");
    expect(sharePercentLabel(2, 0)).toBe("0%");
  });
});
