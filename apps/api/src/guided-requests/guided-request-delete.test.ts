import { describe, expect, it, vi } from "vitest";
import { GuidedRequestsService, WITHDRAWN_TIMELINE_MESSAGE } from "./guided-requests.service";

/**
 * "Elimina richiesta" del cliente (docs/CHANGELOG.md §343): la richiesta
 * sparisce per lui ma resta nel database (professionisti e admin), si può
 * annullare per qualche minuto e si cancella davvero solo dopo il periodo
 * fisso, mai se è stata segnalata.
 */
type Request = { id: string; clientId: string; status: string; closedReason: string | null; deletedByClientAt: Date | null; deletedWhileOpen: boolean };

function buildService({ request, bookings = 0, leads = [{ professionalProfileId: "pro-1" }], reported = [] as string[], candidates = [] as string[] }: {
  request?: Partial<Request>;
  bookings?: number;
  leads?: { professionalProfileId: string }[];
  reported?: string[];
  candidates?: string[];
} = {}) {
  const row: Request = { id: "gr-1", clientId: "client-1", status: "OPEN", closedReason: null, deletedByClientAt: null, deletedWhileOpen: false, ...request };
  const prisma = {
    guidedRequest: {
      findUnique: vi.fn().mockResolvedValue(row),
      findMany: vi.fn((_args: { where: { deletedByClientAt: { lt: Date } } }) => Promise.resolve(candidates.map((id) => ({ id })))),
      update: vi.fn((args: { where: { id: string }; data: Record<string, unknown> }) => args),
      delete: vi.fn((args: unknown) => args),
    },
    lead: { findMany: vi.fn().mockResolvedValue(leads), updateMany: vi.fn((args: unknown) => args) },
    booking: { count: vi.fn().mockResolvedValue(bookings) },
    notification: { updateMany: vi.fn((args: unknown) => args), deleteMany: vi.fn((args: unknown) => args) },
    conversationEvent: { deleteMany: vi.fn((args: unknown) => args) },
    contentReport: { findMany: vi.fn().mockResolvedValue(reported.map((targetId) => ({ targetId }))) },
    $transaction: vi.fn().mockResolvedValue([]),
  };
  const timeline = { log: vi.fn() };
  const service = new GuidedRequestsService(prisma as never, {} as never, {} as never, timeline as never, {} as never);
  return { service, prisma, timeline };
}

describe("GuidedRequestsService.deleteByClient", () => {
  it("chiude e nasconde una richiesta aperta, con il motivo, e lo scrive nella chat dei professionisti", async () => {
    const { service, prisma, timeline } = buildService();
    await service.deleteByClient("client-1", "gr-1", "FOUND_ELSEWHERE");
    expect(prisma.lead.updateMany).toHaveBeenCalledWith({ where: { guidedRequestId: "gr-1", status: "PENDING" }, data: { status: "EXPIRED" } });
    expect(prisma.guidedRequest.update).toHaveBeenCalledWith({
      where: { id: "gr-1" },
      data: expect.objectContaining({ status: "CLOSED", closedReason: "CANCELED_BY_CLIENT", deletedWhileOpen: true, withdrawReason: "FOUND_ELSEWHERE", deletedByClientAt: expect.any(Date) }),
    });
    expect(timeline.log).toHaveBeenCalledWith("gr-1", "pro-1", "CLIENT", WITHDRAWN_TIMELINE_MESSAGE);
    expect(prisma.guidedRequest.delete).not.toHaveBeenCalled();
  });

  it("una richiesta scaduta si nasconde soltanto, senza cambiarne lo stato", async () => {
    const { service, prisma, timeline } = buildService({ request: { status: "CLOSED", closedReason: "EXPIRED" } });
    await service.deleteByClient("client-1", "gr-1");
    const data = prisma.guidedRequest.update.mock.calls[0]?.[0].data;
    expect(data?.status).toBeUndefined();
    expect(data?.deletedWhileOpen).toBe(false);
    expect(prisma.lead.updateMany).not.toHaveBeenCalled();
    expect(timeline.log).not.toHaveBeenCalled();
  });

  it("non elimina una richiesta diventata un lavoro", async () => {
    const { service, prisma } = buildService({ bookings: 1 });
    await expect(service.deleteByClient("client-1", "gr-1")).rejects.toThrow("archiviarla");
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("rifiuta chi non è il cliente e una richiesta già eliminata", async () => {
    await expect(buildService().service.deleteByClient("altro", "gr-1")).rejects.toThrow("Questa richiesta non è tua.");
    await expect(buildService({ request: { deletedByClientAt: new Date() } }).service.deleteByClient("client-1", "gr-1")).rejects.toThrow("Richiesta non trovata.");
  });
});

describe("GuidedRequestsService.restoreDeletedByClient", () => {
  it("riapre la richiesta che era aperta e toglie la riga dalla chat", async () => {
    const deletedAt = new Date(Date.now() - 5_000);
    const { service, prisma } = buildService({ request: { status: "CLOSED", closedReason: "CANCELED_BY_CLIENT", deletedByClientAt: deletedAt, deletedWhileOpen: true } });
    await service.restoreDeletedByClient("client-1", "gr-1");
    expect(prisma.guidedRequest.update).toHaveBeenCalledWith({
      where: { id: "gr-1" },
      data: { deletedByClientAt: null, deletedWhileOpen: false, withdrawReason: null, status: "OPEN", closedReason: null },
    });
    expect(prisma.lead.updateMany).toHaveBeenCalled();
    expect(prisma.conversationEvent.deleteMany).toHaveBeenCalledWith({
      where: { guidedRequestId: "gr-1", automatic: true, message: WITHDRAWN_TIMELINE_MESSAGE, createdAt: { gte: deletedAt } },
    });
  });

  it("una richiesta già chiusa torna visibile ma resta chiusa", async () => {
    const { service, prisma } = buildService({ request: { status: "CLOSED", closedReason: "EXPIRED", deletedByClientAt: new Date(), deletedWhileOpen: false } });
    await service.restoreDeletedByClient("client-1", "gr-1");
    expect(prisma.guidedRequest.update.mock.calls[0]?.[0].data.status).toBeUndefined();
    expect(prisma.lead.updateMany).not.toHaveBeenCalled();
  });

  it("dopo il tempo massimo non si annulla più", async () => {
    const { service } = buildService({ request: { status: "CLOSED", closedReason: "CANCELED_BY_CLIENT", deletedByClientAt: new Date(Date.now() - 60 * 60_000), deletedWhileOpen: true } });
    await expect(service.restoreDeletedByClient("client-1", "gr-1")).rejects.toThrow("troppo tempo");
  });
});

describe("GuidedRequestsService.purgeClientDeletedRequests", () => {
  it("cancella davvero solo le richieste non segnalate", async () => {
    const { service, prisma } = buildService({ candidates: ["gr-a", "gr-b"], reported: ["gr-b"] });
    const deleted = await service.purgeClientDeletedRequests(new Date("2027-03-01T00:00:00Z"));
    expect(deleted).toBe(1);
    expect(prisma.guidedRequest.delete).toHaveBeenCalledTimes(1);
    expect(prisma.guidedRequest.delete).toHaveBeenCalledWith({ where: { id: "gr-a" } });
    const where = prisma.guidedRequest.findMany.mock.calls[0]?.[0].where;
    expect(where?.deletedByClientAt.lt.toISOString()).toBe("2026-12-01T00:00:00.000Z");
  });
});
