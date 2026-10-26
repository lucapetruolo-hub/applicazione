import { describe, expect, it } from "vitest";
import { sharePercentLabel } from "@professionisti/shared";
import {
  buildCategoryActivity,
  buildSearchStats,
  buildChurnByMonth,
  buildCoverage,
  buildProfessionalStats,
  professionalPlanOf,
  professionalStatusOf,
  type ProfessionalStatsRow,
} from "./professional-stats";

const NOW = new Date("2026-10-26T12:00:00Z");

const row = (overrides: Partial<ProfessionalStatsRow> = {}): ProfessionalStatsRow => ({
  id: "p",
  city: "Latina",
  imageUrl: null,
  bio: null,
  verified: false,
  hasAgenda: false,
  servicesCount: 0,
  quotesCount: 0,
  bookingsCount: 0,
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

  it("attivi, passi dell'iscrizione e profili completi", () => {
    const stats = buildProfessionalStats(
      [
        row({ id: "a", imageUrl: "x", bio: "Ciao", servicesCount: 2, hasAgenda: true, verified: true, quotesCount: 3, bookingsCount: 1 }),
        row({ id: "b", imageUrl: "x", bio: "  ", fiscalProfile: null }),
        row({ id: "c" }),
      ],
      NOW,
      { cityOptions: [], excluded: { deleted: 0, demo: 0 }, activeIds: new Set(["a", "z"]) },
    );
    expect(stats.active30d).toBe(1);
    expect(stats.funnel).toEqual([
      { key: "REGISTERED", count: 3 },
      { key: "FISCAL", count: 2 },
      { key: "IDENTITY", count: 1 },
      { key: "FIRST_QUOTE", count: 1 },
      { key: "FIRST_JOB", count: 1 },
    ]);
    expect(stats.completeness).toEqual([
      { key: "PHOTO", count: 2 },
      { key: "BIO", count: 1 },
      { key: "SERVICES", count: 1 },
      { key: "AGENDA", count: 1 },
      { key: "ALL", count: 1 },
    ]);
  });

  it("copertura: prima le zone con richieste senza preventivo, città senza maiuscole", () => {
    const coverage = buildCoverage(
      [
        { categorySlug: "idraulico", city: "Latina", quotes: 2 },
        { categorySlug: "idraulico", city: "latina ", quotes: 0 },
        { categorySlug: "fabbro", city: "Aprilia", quotes: 0 },
        { categorySlug: "fabbro", city: "Aprilia", quotes: 0 },
        { categorySlug: "pulizie", city: "", quotes: 0 },
      ],
      [
        { city: "LATINA", categorySlugs: ["idraulico", "fabbro"] },
        { city: "Latina", categorySlugs: ["idraulico"] },
      ],
    );
    expect(coverage).toEqual([
      { categorySlug: "fabbro", categoryLabel: "Fabbro", city: "Aprilia", requests: 2, unanswered: 2, professionals: 0 },
      { categorySlug: "idraulico", categoryLabel: "Idraulico", city: "Latina", requests: 2, unanswered: 1, professionals: 2 },
    ]);
  });

  it("risposte, preventivi e recensioni per categoria", () => {
    const at = (min: number) => new Date(NOW.getTime() + min * 60_000);
    const rows = buildCategoryActivity({
      leads: [
        { categorySlug: "idraulico", createdAt: NOW, answeredAt: at(10), declined: false },
        { categorySlug: "idraulico", createdAt: NOW, answeredAt: at(30), declined: false },
        { categorySlug: "idraulico", createdAt: NOW, answeredAt: null, declined: true },
        { categorySlug: "idraulico", createdAt: NOW, answeredAt: null, declined: false },
      ],
      quotes: [
        { categorySlug: "idraulico", accepted: true },
        { categorySlug: "idraulico", accepted: false },
      ],
      reviews: [
        { categorySlug: "fabbro", rating: 5 },
        { categorySlug: "fabbro", rating: 4 },
      ],
    });
    expect(rows).toEqual([
      { slug: "idraulico", label: "Idraulico", leads: 4, answered: 3, medianMinutesToAnswer: 20, quotes: 2, accepted: 1, reviews: 0, avgRating: null },
      { slug: "fabbro", label: "Fabbro", leads: 0, answered: 0, medianMinutesToAnswer: null, quotes: 0, accepted: 0, reviews: 2, avgRating: 4.5 },
    ]);
  });

  it("abbandoni degli ultimi 12 mesi", () => {
    const churn = buildChurnByMonth(
      { deletedAt: [new Date("2026-10-02T10:00:00Z"), new Date("2024-01-01T10:00:00Z")], pausedAt: [new Date("2026-09-30T23:30:00Z")], canceledAt: [new Date("2026-03-05T10:00:00Z")] },
      NOW,
    );
    expect(churn).toHaveLength(12);
    expect(churn[0]?.key).toBe("2025-11");
    expect(churn.at(-1)).toEqual({ key: "2026-10", deleted: 1, paused: 1, canceled: 0 });
    expect(churn.find((m) => m.key === "2026-03")?.canceled).toBe(1);
  });

  it("percentuali leggibili", () => {
    expect(sharePercentLabel(1, 3)).toBe("33%");
    expect(sharePercentLabel(1, 300)).toBe("<1%");
    expect(sharePercentLabel(0, 3)).toBe("0%");
    expect(sharePercentLabel(2, 0)).toBe("0%");
  });

  it("cosa cercano: città e lavori cercati, senza nessuno vicino, per nome o solo città (§370)", () => {
    const stats = buildSearchStats(
      {
        categoryDays: [
          { categorySlug: "fabbro", city: "aprilia", count: 4, emptyCount: 4 },
          { categorySlug: "fabbro", city: "aprilia", count: 2, emptyCount: 1 },
          { categorySlug: "idraulico", city: "latina", count: 9, emptyCount: 0 },
          { categorySlug: "idraulico", city: "", count: 1, emptyCount: 0 },
        ],
        freeDays: [
          { city: "latina", withText: true, count: 3, emptyCount: 1 },
          { city: "latina", withText: false, count: 2, emptyCount: 0 },
          { city: "borgo sabotino", withText: false, count: 1, emptyCount: 1 },
        ],
      },
      [
        { city: "Latina", categorySlugs: ["idraulico"] },
        { city: "LATINA", categorySlugs: ["idraulico", "fabbro"] },
      ],
    );
    expect(stats).toMatchObject({ total: 22, empty: 7, withText: 3, cityOnly: 3 });
    expect(stats.byCity[0]).toEqual({ city: "Latina", searches: 14, empty: 1 });
    expect(stats.byCity.find((c) => c.city === "Aprilia")).toEqual({ city: "Aprilia", searches: 6, empty: 5 });
    // Non un comune: iniziali maiuscole.
    expect(stats.byCity.find((c) => c.city === "Borgo Sabotino")?.searches).toBe(1);
    expect(stats.byCategoryCity[0]).toEqual({ categorySlug: "fabbro", categoryLabel: "Fabbro", city: "Aprilia", searches: 6, empty: 5, professionals: 0 });
    expect(stats.byCategoryCity.find((z) => z.categorySlug === "idraulico" && z.city === "Latina")?.professionals).toBe(2);
    // Senza città: i professionisti di quel lavoro ovunque.
    expect(stats.byCategoryCity.find((z) => z.categorySlug === "idraulico" && z.city === "")?.professionals).toBe(2);
  });
});
