import { describe, expect, it, vi } from "vitest";
import { NotFoundException } from "@nestjs/common";
import { BOARD_CLIENT_COUNT_MIN } from "@professionisti/shared";
import { RequestBoardService } from "./request-board.service";
import { GuidedRequestsService } from "../guided-requests/guided-requests.service";

/**
 * PR 3 della bacheca (docs/changelog/2026-11-18-bacheca-cliente.md): numero in
 * /cerca solo da una soglia, richieste più vicine oltre i 100 km, interruttore
 * del cliente. Database finto.
 */
const NOW = new Date("2026-11-18T10:00:00Z");

function boardRow(id: string, city: string) {
  return {
    id,
    city,
    boardTrade: "idraulico",
    boardTitle: "Perdita sotto il lavandino",
    boardSummary: "Perde acqua dal sifone.",
    boardPlace: city,
    boardProvince: "XX",
    boardAt: NOW,
    serviceMode: "AT_HOME",
    timing: null,
    photoUrls: [],
    _count: { quotes: 0 },
  };
}

describe("bacheca: numero delle richieste in /cerca", () => {
  const service = (count: number) => {
    const prisma = { guidedRequest: { count: vi.fn().mockResolvedValue(count) } };
    return { service: new RequestBoardService(prisma as never, {} as never, {} as never, {} as never), prisma };
  };

  it("sotto la soglia non si mostra nessun numero", async () => {
    const { service: s } = service(BOARD_CLIENT_COUNT_MIN - 1);
    expect(await s.demand("idraulico", "RM", NOW)).toEqual({ count: null });
  });

  it("dalla soglia in su si mostra il numero, solo per i comuni della provincia", async () => {
    const { service: s, prisma } = service(BOARD_CLIENT_COUNT_MIN);
    expect(await s.demand("idraulico", "RM", NOW)).toEqual({ count: BOARD_CLIENT_COUNT_MIN });
    const [[{ where }]] = prisma.guidedRequest.count.mock.calls as unknown as [[{ where: { city: { in: string[] }; waitingTrade: unknown } }]];
    expect(where.city.in).toContain("Roma");
    expect(where.city.in).not.toContain("Milano");
    expect(where.waitingTrade).toBeNull();
  });

  it("provincia sconosciuta: nessuna domanda al database", async () => {
    const { service: s, prisma } = service(50);
    expect(await s.demand("idraulico", "ZZ", NOW)).toEqual({ count: null });
    expect(prisma.guidedRequest.count).not.toHaveBeenCalled();
  });
});

describe("bacheca: oltre 100 km le richieste più vicine", () => {
  function setup(profile: { latitude: number; longitude: number }) {
    const prisma = {
      user: { findUnique: vi.fn().mockResolvedValue({ role: "PROFESSIONAL", professionalProfile: { id: "p1" } }) },
      guidedRequest: {
        findFirst: vi.fn().mockResolvedValue({ id: "far", boardTrade: "idraulico", _count: { quotes: 0 } }),
        findMany: vi.fn().mockResolvedValue([boardRow("milano", "Milano"), boardRow("frosinone", "Frosinone"), boardRow("latina", "Latina"), boardRow("viterbo", "Viterbo"), boardRow("tivoli", "Tivoli")]),
      },
      professionalProfile: { findUnique: vi.fn().mockResolvedValue(profile) },
      lead: { count: vi.fn().mockResolvedValue(0) },
      boardClaim: { upsert: vi.fn(), deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    };
    const guidedRequests = { addBoardLead: vi.fn().mockResolvedValue("too-far") };
    return new RequestBoardService(prisma as never, guidedRequests as never, {} as never, {} as never);
  }

  it("al massimo 3, le più vicine prima, mai oltre 100 km", async () => {
    const result = await setup({ latitude: 41.9028, longitude: 12.4964 }).reply("u1", "far", NOW);
    expect(result.status).toBe("too-far");
    const ids = result.nearby?.map((card) => card.id) ?? [];
    expect(ids).toHaveLength(3);
    expect(ids[0]).toBe("tivoli");
    expect(ids).not.toContain("milano");
  });

  it("senza la posizione del profilo nessuna proposta", async () => {
    const result = await setup({ latitude: 0, longitude: 0 }).reply("u1", "far", NOW);
    expect(result.nearby).toEqual([]);
  });
});

describe("bacheca: interruttore del cliente", () => {
  const service = (count: number) => {
    const prisma = { guidedRequest: { updateMany: vi.fn().mockResolvedValue({ count }) } };
    return { service: new GuidedRequestsService(prisma as never, {} as never, {} as never, {} as never, {} as never), prisma };
  };

  it("\"Togli dai lavori cercati\" segna la richiesta solo del suo cliente", async () => {
    const { service: s, prisma } = service(1);
    await s.setBoardAllowed("c1", "req", false);
    expect(prisma.guidedRequest.updateMany).toHaveBeenCalledWith({ where: { id: "req", clientId: "c1", deletedByClientAt: null }, data: { boardOptOut: true } });
  });

  it("la richiesta di un altro cliente non si tocca", async () => {
    const { service: s } = service(0);
    await expect(s.setBoardAllowed("c2", "req", true)).rejects.toBeInstanceOf(NotFoundException);
  });
});
