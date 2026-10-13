import { describe, expect, it, vi } from "vitest";
import { StatsService } from "./stats.service";

function buildService(aggregate: { _count: { _all: number }; _avg: { rating: number | null } }) {
  const prisma = {
    user: { count: vi.fn().mockResolvedValue(120) },
    professionalProfile: { count: vi.fn().mockResolvedValue(8) },
    review: { aggregate: vi.fn().mockResolvedValue(aggregate) },
  };
  return { service: new StatsService(prisma as never), prisma };
}

/**
 * Media delle stelle sotto il titolo delle recensioni in home
 * (docs/CHANGELOG.md §229): tutte le recensioni pubbliche, anche quelle da
 * 1 e 2 stelle che la home non mostra.
 */
describe("StatsService.getPlatformStats — media delle recensioni", () => {
  it("restituisce numero e media di tutte le recensioni pubbliche", async () => {
    const { service, prisma } = buildService({ _count: { _all: 23 }, _avg: { rating: 4.8 } });
    await expect(service.getPlatformStats()).resolves.toEqual({
      totalUsers: 120,
      totalProfessionals: 8,
      reviewCount: 23,
      averageRating: 4.8,
    });
    const where = prisma.review.aggregate.mock.calls[0]?.[0].where;
    expect(where.hiddenAt).toBeNull();
    expect(where.rating).toBeUndefined();
  });

  it("senza recensioni la media è null", async () => {
    const { service } = buildService({ _count: { _all: 0 }, _avg: { rating: null } });
    await expect(service.getPlatformStats()).resolves.toMatchObject({ reviewCount: 0, averageRating: null });
  });
});
