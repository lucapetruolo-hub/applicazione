import { describe, expect, it, vi } from "vitest";
import { CategoriesService, MIN_CITY_SCORE, REQUEST_WEIGHT } from "./categories.service";

type Groups = { categoryId: string; n: number }[];

function buildService(city: { requests?: Groups; searches?: Groups }, all: { requests?: Groups; searches?: Groups }) {
  const prisma = {
    guidedRequest: {
      groupBy: vi.fn().mockImplementation(({ where }: { where: { city?: unknown } }) =>
        Promise.resolve(((where.city ? city.requests : all.requests) ?? []).map((g) => ({ categoryId: g.categoryId, _count: { _all: g.n } }))),
      ),
    },
    categorySearchDay: {
      groupBy: vi.fn().mockImplementation(({ where }: { where: { city?: unknown } }) =>
        Promise.resolve(((where.city ? city.searches : all.searches) ?? []).map((g) => ({ categoryId: g.categoryId, _sum: { count: g.n } }))),
      ),
      upsert: vi.fn().mockResolvedValue(undefined),
    },
    category: {
      findMany: vi.fn().mockResolvedValue([
        { id: "c1", slug: "idraulico" },
        { id: "c2", slug: "elettricista" },
        { id: "c3", slug: "pulizie" },
      ]),
      findUnique: vi.fn().mockImplementation(({ where }: { where: { slug: string } }) => Promise.resolve(where.slug === "idraulico" ? { id: "c1" } : null)),
    },
  };
  return { service: new CategoriesService(prisma as never), prisma };
}

/** Lavori più cercati prima nella scelta dei lavori (docs/CHANGELOG.md §279-§280). */
describe("CategoriesService.getPopularity", () => {
  it("usa la città quando ha abbastanza richieste, in ordine decrescente", async () => {
    const { service } = buildService(
      { requests: [{ categoryId: "c1", n: 2 }, { categoryId: "c3", n: 5 }] },
      { requests: [{ categoryId: "c2", n: 50 }] },
    );
    await expect(service.getPopularity("Latina")).resolves.toEqual({
      scope: "CITY",
      counts: [
        { slug: "pulizie", count: 5 * REQUEST_WEIGHT },
        { slug: "idraulico", count: 2 * REQUEST_WEIGHT },
      ],
    });
  });

  it("somma ricerche e richieste: una richiesta pesa come tre ricerche", async () => {
    const { service } = buildService(
      { requests: [{ categoryId: "c1", n: 1 }], searches: [{ categoryId: "c1", n: 2 }, { categoryId: "c2", n: MIN_CITY_SCORE }] },
      {},
    );
    await expect(service.getPopularity("latina")).resolves.toEqual({
      scope: "CITY",
      counts: [
        { slug: "elettricista", count: MIN_CITY_SCORE },
        { slug: "idraulico", count: REQUEST_WEIGHT + 2 },
      ],
    });
  });

  it("con pochi dati in città usa tutta la piattaforma", async () => {
    const { service } = buildService(
      { requests: [{ categoryId: "c1", n: 1 }], searches: [{ categoryId: "c1", n: 3 }] },
      { requests: [{ categoryId: "c2", n: 7 }, { categoryId: "c1", n: 3 }], searches: [{ categoryId: "c3", n: 4 }] },
    );
    await expect(service.getPopularity("Latina")).resolves.toEqual({
      scope: "ALL",
      counts: [
        { slug: "elettricista", count: 7 * REQUEST_WEIGHT },
        { slug: "idraulico", count: 3 * REQUEST_WEIGHT },
        { slug: "pulizie", count: 4 },
      ],
    });
  });

  it("senza città conta tutta la piattaforma e ignora categorie tolte", async () => {
    const { service, prisma } = buildService({}, { requests: [{ categoryId: "c1", n: 4 }, { categoryId: "vecchia", n: 9 }] });
    await expect(service.getPopularity()).resolves.toEqual({ scope: "ALL", counts: [{ slug: "idraulico", count: 4 * REQUEST_WEIGHT }] });
    expect(prisma.guidedRequest.groupBy).toHaveBeenCalledTimes(1);
  });
});

describe("CategoriesService.recordSearch", () => {
  it("conta per giorno e città in minuscolo, mai chi cerca", async () => {
    const { service, prisma } = buildService({}, {});
    await service.recordSearch("idraulico", "  Latina ");
    const call = prisma.categorySearchDay.upsert.mock.calls[0]?.[0];
    expect(call.create).toMatchObject({ categoryId: "c1", city: "latina", count: 1 });
    expect(call.update).toEqual({ count: { increment: 1 } });
  });

  it("ignora una categoria sconosciuta", async () => {
    const { service, prisma } = buildService({}, {});
    await service.recordSearch("inesistente", "Latina");
    expect(prisma.categorySearchDay.upsert).not.toHaveBeenCalled();
  });
});
