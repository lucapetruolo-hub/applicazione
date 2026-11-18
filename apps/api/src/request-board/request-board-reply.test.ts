import { describe, expect, it, vi } from "vitest";
import { ForbiddenException } from "@nestjs/common";
import { RequestBoardService } from "./request-board.service";

/** "Rispondi" della bacheca (docs/changelog/2026-11-17-bacheca-rispondi.md) con un database finto. */
function setup(options: { role?: string; profileId?: string | null; listed?: boolean; quotes?: number; received?: number; leadStatus?: string }) {
  const prisma = {
    user: { findUnique: vi.fn().mockResolvedValue({ role: options.role ?? "PROFESSIONAL", professionalProfile: options.profileId ? { id: options.profileId } : null }) },
    guidedRequest: {
      findFirst: vi.fn().mockResolvedValue(options.listed === false ? null : { id: "req", boardTrade: "idraulico", _count: { quotes: options.quotes ?? 0 } }),
    },
    lead: { count: vi.fn().mockResolvedValue(options.received ?? 0) },
    boardClaim: { upsert: vi.fn().mockResolvedValue({}), deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
  };
  const guidedRequests = { addBoardLead: vi.fn().mockResolvedValue(options.leadStatus ?? "added") };
  const service = new RequestBoardService(prisma as never, guidedRequests as never, {} as never, {} as never);
  return { service, prisma, guidedRequests };
}

describe("bacheca: Rispondi", () => {
  it("un cliente non può rispondere", async () => {
    const { service } = setup({ role: "CLIENT" });
    await expect(service.reply("u1", "req")).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("richiesta non più in bacheca", async () => {
    const { service } = setup({ listed: false, profileId: "p1" });
    expect((await service.reply("u1", "req")).status).toBe("closed");
  });

  it("già ricevuta prima dei posti finiti", async () => {
    const { service } = setup({ profileId: "p1", received: 1, quotes: 5 });
    expect((await service.reply("u1", "req")).status).toBe("already");
  });

  it("5 preventivi: posti finiti", async () => {
    const { service, guidedRequests } = setup({ profileId: "p1", quotes: 5 });
    expect((await service.reply("u1", "req")).status).toBe("full");
    expect(guidedRequests.addBoardLead).not.toHaveBeenCalled();
  });

  it("senza profilo la richiesta resta da parte", async () => {
    const { service, prisma } = setup({ profileId: null });
    const result = await service.reply("u1", "req");
    expect(result).toMatchObject({ status: "saved", tradeLabel: "Idraulico" });
    expect(prisma.boardClaim.upsert).toHaveBeenCalled();
  });

  it("con il profilo visibile entra nell'elenco e la riga in attesa si chiude", async () => {
    const { service, prisma, guidedRequests } = setup({ profileId: "p1" });
    expect((await service.reply("u1", "req")).status).toBe("added");
    expect(guidedRequests.addBoardLead).toHaveBeenCalledWith("p1", "req", expect.any(Date));
    expect(prisma.boardClaim.deleteMany).toHaveBeenCalled();
  });
});
