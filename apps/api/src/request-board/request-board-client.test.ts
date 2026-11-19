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

describe("bacheca: lavori cercati della settimana", () => {
  const profile = (id: string, slug: string, lat: number, lon: number) => ({
    id,
    userId: `u-${id}`,
    category: { slug },
    extraCategories: [],
    services: [],
    certifications: null,
    bio: null,
    latitude: lat,
    longitude: lon,
    remoteAvailable: false,
    user: { name: "Mario" },
  });

  function setup(options: { enabled?: boolean; received?: string[] } = {}) {
    if (options.enabled === false) delete process.env.REQUEST_BOARD_ENABLED;
    else process.env.REQUEST_BOARD_ENABLED = "true";
    const rows = [boardRow("tivoli", "Tivoli"), boardRow("milano", "Milano")].map((row) => ({
      ...row,
      waitingTrade: null,
      waitingTradeKey: null,
      leads: (row.id === "tivoli" ? (options.received ?? []) : []).map((professionalProfileId) => ({ professionalProfileId })),
    }));
    const prisma = {
      guidedRequest: { findMany: vi.fn().mockResolvedValue(rows) },
      professionalProfile: {
        findMany: vi.fn().mockResolvedValue([profile("roma", "idraulico", 41.9028, 12.4964), profile("elettricista", "elettricista", 41.9028, 12.4964), profile("bari", "idraulico", 41.1171, 16.8719)]),
      },
    };
    const guidedRequests = { receivesRequests: vi.fn().mockResolvedValue(true) };
    const notifications = { sendOwnEmail: vi.fn().mockResolvedValue(true) };
    return { service: new RequestBoardService(prisma as never, guidedRequests as never, {} as never, notifications as never), notifications };
  }

  it("solo a chi fa quel mestiere entro 100 km, con le richieste vicine", async () => {
    const { service, notifications } = setup();
    expect(await service.sendWeeklyDigest(NOW)).toEqual({ sent: 1 });
    const [userId, type, content] = notifications.sendOwnEmail.mock.calls[0] as [string, string, { details: { url: string }[] }];
    expect(userId).toBe("u-roma");
    expect(type).toBe("BOARD_WEEKLY_DIGEST");
    expect(content.details).toHaveLength(1);
    expect(content.details[0]?.url).toContain("richiesta=tivoli");
  });

  it("niente email per una richiesta che gli è già arrivata", async () => {
    const { service, notifications } = setup({ received: ["roma"] });
    expect(await service.sendWeeklyDigest(NOW)).toEqual({ sent: 0 });
    expect(notifications.sendOwnEmail).not.toHaveBeenCalled();
  });

  it("con la bacheca spenta non parte nulla", async () => {
    const { service, notifications } = setup({ enabled: false });
    expect(await service.sendWeeklyDigest(NOW)).toEqual({ sent: 0 });
    expect(notifications.sendOwnEmail).not.toHaveBeenCalled();
  });
});

describe("bacheca: richieste vicine in Oggi e avviso sul sito", () => {
  const profile = (id: string, slug: string, lat: number, lon: number) => ({
    id,
    userId: `u-${id}`,
    category: { slug },
    extraCategories: [],
    services: [],
    certifications: null,
    bio: null,
    latitude: lat,
    longitude: lon,
    remoteAvailable: false,
    user: { name: "Mario" },
  });

  function setup(options: { received?: string[]; me?: ReturnType<typeof profile> | null } = {}) {
    const rows = [boardRow("tivoli", "Tivoli"), boardRow("fiumicino", "Fiumicino"), boardRow("milano", "Milano")].map((row) => ({
      ...row,
      waitingTrade: null,
      waitingTradeKey: null,
      leads: (row.id === "tivoli" ? (options.received ?? []) : []).map((professionalProfileId) => ({ professionalProfileId })),
    }));
    // Come il database: con `id: { in }` solo quelle richieste.
    const findMany = vi.fn(async ({ where }: { where: { AND: [unknown, { id?: { in: string[] } }] } }) => {
      const ids = where.AND[1].id?.in;
      return ids ? rows.filter((row) => ids.includes(row.id)) : rows;
    });
    const prisma = {
      guidedRequest: { findMany },
      professionalProfile: {
        findUnique: vi.fn().mockResolvedValue(options.me === undefined ? profile("roma", "idraulico", 41.9028, 12.4964) : options.me),
        findMany: vi.fn().mockResolvedValue([profile("roma", "idraulico", 41.9028, 12.4964), profile("elettricista", "elettricista", 41.9028, 12.4964), profile("bari", "idraulico", 41.1171, 16.8719)]),
      },
    };
    const guidedRequests = { receivesRequests: vi.fn().mockResolvedValue(true) };
    const notifications = { notify: vi.fn().mockResolvedValue(undefined) };
    return { service: new RequestBoardService(prisma as never, guidedRequests as never, {} as never, notifications as never), notifications, guidedRequests };
  }

  it("Oggi: solo richieste del suo mestiere entro 100 km, le più vicine prima, con i km", async () => {
    const { service } = setup();
    const result = await service.nearMe("u-roma", NOW);
    expect(result.total).toBe(2);
    expect(result.cards.map((card) => card.id).sort()).toEqual(["fiumicino", "tivoli"]);
    const km = result.cards.map((card) => card.km);
    expect(km).toEqual([...km].sort((a, b) => a - b));
    expect(km.every((value) => value > 0 && value <= 100)).toBe(true);
  });

  it("Oggi: mai una richiesta già ricevuta", async () => {
    const { service } = setup({ received: ["roma"] });
    const result = await service.nearMe("u-roma", NOW);
    expect(result.cards.map((card) => card.id)).toEqual(["fiumicino"]);
  });

  it("Oggi: senza profilo da professionista nessuna richiesta", async () => {
    const { service } = setup({ me: null });
    expect(await service.nearMe("u-cliente", NOW)).toEqual({ cards: [], total: 0 });
  });

  it("avviso: un solo avviso per giro a chi può rispondere, con il numero delle richieste", async () => {
    const { service, notifications } = setup();
    expect(await service.notifyNearby(["tivoli", "fiumicino", "milano"], NOW)).toEqual({ notified: 1 });
    const [userId, type, payload] = notifications.notify.mock.calls[0] as [string, string, { count: number; boardRequestId: string }];
    expect(userId).toBe("u-roma");
    expect(type).toBe("BOARD_NEARBY");
    expect(payload.count).toBe(2);
  });

  it("avviso: niente se la richiesta gli è già arrivata o se non riceve richieste", async () => {
    const received = setup({ received: ["roma"] });
    expect(await received.service.notifyNearby(["tivoli"], NOW)).toEqual({ notified: 0 });
    const { service, notifications, guidedRequests } = setup();
    guidedRequests.receivesRequests.mockResolvedValue(false);
    expect(await service.notifyNearby(["tivoli"], NOW)).toEqual({ notified: 0 });
    expect(notifications.notify).not.toHaveBeenCalled();
  });

  it("avviso: nessuna richiesta nuova, nessuna domanda al database", async () => {
    const { service, notifications } = setup();
    expect(await service.notifyNearby([], NOW)).toEqual({ notified: 0 });
    expect(notifications.notify).not.toHaveBeenCalled();
  });
});

describe("bacheca: richieste inoltrate in Lavori cercati", () => {
  // docs/changelog/2026-11-19-inoltrate-in-lavori-cercati.md
  type Branch = Record<string, unknown> & { OR?: Record<string, unknown>[] };
  async function candidatesWhere() {
    process.env.REQUEST_BOARD_ENABLED = "true";
    const previousKey = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = "prova";
    const prisma = {
      guidedRequest: { findMany: vi.fn().mockResolvedValue([]) },
      boardAlert: { findMany: vi.fn().mockResolvedValue([]), deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    };
    try {
      await new RequestBoardService(prisma as never, {} as never, {} as never, {} as never).publishNew(NOW);
    } finally {
      if (previousKey === undefined) delete process.env.ANTHROPIC_API_KEY;
      else process.env.ANTHROPIC_API_KEY = previousKey;
    }
    const [[{ where }]] = prisma.guidedRequest.findMany.mock.calls as unknown as [[{ where: Record<string, unknown> & { AND: { OR: Branch[] }[] } }]];
    return where;
  }

  it("una generale resta come prima, senza professionista scelto", async () => {
    const where = await candidatesWhere();
    const general = where.AND[0]!.OR.find((branch) => branch.professionalProfileId === null);
    expect(general).toBeDefined();
    expect(where.professionalProfileId).toBeUndefined();
    expect(where.fromProfessionalLink).toBe(false);
    expect(where.isUrgent).toBe(false);
  });

  it("una diretta entra solo con \"Poi in Lavori cercati\", dopo l'inoltro: 48 ore dopo o subito se l'inoltro non ha trovato nessuno", async () => {
    const where = await candidatesWhere();
    const forwarded = where.AND[0]!.OR.find((branch) => branch.boardAfterForward === true);
    expect(forwarded).toMatchObject({ professionalProfileId: { not: null }, forwardIfNoReply: true, forwardedAt: { not: null } });
    expect(forwarded!.OR).toEqual([
      { forwardedAt: { lte: new Date(NOW.getTime() - 48 * 3_600_000) } },
      { leads: { none: { wasExpanded: true, fromBoardAt: null } } },
    ]);
  });
});
