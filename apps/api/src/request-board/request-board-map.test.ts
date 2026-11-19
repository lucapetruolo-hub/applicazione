import { describe, expect, it, vi } from "vitest";
import { boardPlacePoint, findComuneByName } from "@professionisti/shared";
import { RequestBoardService } from "./request-board.service";

/**
 * Mappa dei "Lavori cercati" (analisi/bacheca-mappa-piano.md): mai il punto
 * esatto, comuni piccoli sul capoluogo, lavori online fuori, bordi e filtri.
 */
const NOW = new Date("2026-11-19T10:00:00Z");

function row(id: string, place: string, province: string, extra: Partial<{ serviceMode: string; boardAt: Date; quotes: number }> = {}) {
  return {
    id,
    boardTrade: "idraulico",
    boardTitle: "Perdita sotto il lavandino",
    boardSummary: "Perde acqua dal sifone.",
    boardPlace: place,
    boardProvince: province,
    boardAt: extra.boardAt ?? NOW,
    serviceMode: extra.serviceMode ?? "HOME",
    timing: null,
    photoUrls: [],
    _count: { quotes: extra.quotes ?? 0 },
  };
}

function setup(rows: ReturnType<typeof row>[]) {
  const prisma = { guidedRequest: { findMany: vi.fn().mockResolvedValue(rows) } };
  return { service: new RequestBoardService(prisma as never, {} as never, {} as never, {} as never), prisma };
}

describe("bacheca: punto sulla mappa", () => {
  it("un comune grande sta al suo centro", () => {
    const padova = findComuneByName("Padova")!;
    expect(boardPlacePoint("Padova", "PD")).toEqual({ lat: padova.lat, lon: padova.lon });
  });

  it("un comune piccolo (\"Provincia di …\") sta sul capoluogo, mai sul paese", () => {
    const latina = findComuneByName("Latina")!;
    expect(boardPlacePoint("Provincia di Latina", "LT")).toEqual({ lat: latina.lat, lon: latina.lon });
  });

  it("provincia sconosciuta: nessun punto", () => {
    expect(boardPlacePoint("Roma", "ZZ")).toBeNull();
  });
});

describe("bacheca: mappa", () => {
  it("un punto per luogo con il numero, lavori online fuori dalla domanda", async () => {
    const { service, prisma } = setup([row("a", "Roma", "RM"), row("b", "Roma", "RM"), row("c", "Provincia di Latina", "LT")]);
    const result = await service.map({}, NOW);
    expect(result.total).toBe(3);
    expect(result.points).toHaveLength(2);
    expect(result.points.find((p) => p.place === "Roma")).toMatchObject({ count: 2, fresh: true });
    const [[{ where }]] = prisma.guidedRequest.findMany.mock.calls as unknown as [[{ where: { serviceMode: unknown; client: unknown } }]];
    expect(where.serviceMode).toEqual({ not: "ONLINE" });
    // Stesse regole della bacheca: account di prova e clienti tolti restano fuori.
    expect(where.client).toMatchObject({ testAccountAt: null, deletedAt: null });
  });

  it("con i bordi conta solo l'area visibile", async () => {
    const { service } = setup([row("a", "Roma", "RM"), row("b", "Milano", "MI")]);
    const result = await service.map({ bounds: { north: 42.5, south: 41.5, east: 13, west: 12 } }, NOW);
    expect(result.points.map((p) => p.place)).toEqual(["Roma"]);
    expect(result.cards.map((c) => c.id)).toEqual(["a"]);
  });

  it("mestiere e tempi vanno nella domanda; una richiesta vecchia non è fresca", async () => {
    const old = new Date(NOW.getTime() - 5 * 24 * 60 * 60 * 1000);
    const { service, prisma } = setup([row("a", "Roma", "RM", { boardAt: old })]);
    const result = await service.map({ trade: "idraulico", timing: "WEEK" }, NOW);
    expect(result.points[0]).toMatchObject({ fresh: false });
    const [[{ where }]] = prisma.guidedRequest.findMany.mock.calls as unknown as [[{ where: { boardTrade: string; timing: string } }]];
    expect(where.boardTrade).toBe("idraulico");
    expect(where.timing).toBe("WEEK");
  });

  it("una scheda con i posti finiti non compare", async () => {
    const { service } = setup([row("a", "Roma", "RM", { quotes: 5 })]);
    expect((await service.map({}, NOW)).total).toBe(0);
  });
});
