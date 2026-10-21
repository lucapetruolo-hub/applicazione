import { describe, expect, it, vi } from "vitest";
import { CategoriesService, MIN_CITY_REQUESTS } from "./categories.service";

function buildService(cityGroups: { categoryId: string; n: number }[], allGroups: { categoryId: string; n: number }[]) {
  const toGroups = (list: { categoryId: string; n: number }[]) => list.map((g) => ({ categoryId: g.categoryId, _count: { _all: g.n } }));
  const prisma = {
    guidedRequest: {
      groupBy: vi.fn().mockImplementation(({ where }: { where: { city?: unknown } }) => Promise.resolve(toGroups(where.city ? cityGroups : allGroups))),
    },
    category: {
      findMany: vi.fn().mockResolvedValue([
        { id: "c1", slug: "idraulico" },
        { id: "c2", slug: "elettricista" },
        { id: "c3", slug: "pulizie" },
      ]),
    },
  };
  return { service: new CategoriesService(prisma as never), prisma };
}

/** Lavori più cercati prima nella scelta dei lavori (docs/CHANGELOG.md §273). */
describe("CategoriesService.getPopularity", () => {
  it("usa la città quando ha abbastanza richieste, in ordine decrescente", async () => {
    const { service } = buildService(
      [
        { categoryId: "c1", n: 2 },
        { categoryId: "c3", n: MIN_CITY_REQUESTS },
      ],
      [{ categoryId: "c2", n: 50 }],
    );
    await expect(service.getPopularity("Latina")).resolves.toEqual({
      scope: "CITY",
      counts: [
        { slug: "pulizie", count: MIN_CITY_REQUESTS },
        { slug: "idraulico", count: 2 },
      ],
    });
  });

  it("con poche richieste in città usa tutta la piattaforma", async () => {
    const { service } = buildService([{ categoryId: "c1", n: 1 }], [{ categoryId: "c2", n: 7 }, { categoryId: "c1", n: 3 }]);
    await expect(service.getPopularity("Latina")).resolves.toEqual({
      scope: "ALL",
      counts: [
        { slug: "elettricista", count: 7 },
        { slug: "idraulico", count: 3 },
      ],
    });
  });

  it("senza città conta tutta la piattaforma e ignora categorie tolte", async () => {
    const { service, prisma } = buildService([], [{ categoryId: "c1", n: 4 }, { categoryId: "vecchia", n: 9 }]);
    await expect(service.getPopularity()).resolves.toEqual({ scope: "ALL", counts: [{ slug: "idraulico", count: 4 }] });
    expect(prisma.guidedRequest.groupBy).toHaveBeenCalledTimes(1);
  });
});
