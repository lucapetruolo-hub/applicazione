import { describe, expect, it, vi } from "vitest";
import { loadReviewStats, roundRating } from "./review-stats";

describe("Stelle contate dal database (docs/changelog/2026-11-16-traffico-elevato.md)", () => {
  it("arrotonda la media a un decimale e niente stelle senza recensioni", () => {
    expect(roundRating(4.25, 4)).toBe(4.3);
    expect(roundRating(4, 1)).toBe(4);
    expect(roundRating(null, 0)).toBeNull();
    expect(roundRating(5, 0)).toBeNull();
  });

  it("mette insieme recensioni e lavori del mese per ogni profilo, anche chi non ne ha", async () => {
    const last = new Date("2026-11-10T10:00:00Z");
    const prisma = {
      $queryRaw: vi.fn().mockResolvedValue([{ profileId: "a", count: 3n, average: 4.666, last }]),
      booking: { groupBy: vi.fn().mockResolvedValue([{ professionalProfileId: "b", _count: { _all: 2 } }]) },
    };
    const stats = await loadReviewStats(prisma as never, ["a", "b"], new Date("2026-11-16T09:00:00Z"));
    expect(stats.get("a")).toEqual({ reviewCount: 3, rating: 4.7, lastReviewAt: last, completedThisMonth: 0 });
    expect(stats.get("b")).toEqual({ reviewCount: 0, rating: null, lastReviewAt: null, completedThisMonth: 2 });
  });

  it("nessuna domanda al database senza profili", async () => {
    const prisma = { $queryRaw: vi.fn(), booking: { groupBy: vi.fn() } };
    expect((await loadReviewStats(prisma as never, [])).size).toBe(0);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });
});
