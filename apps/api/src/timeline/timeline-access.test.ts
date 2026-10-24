import { describe, expect, it, vi } from "vitest";
import { ForbiddenException } from "@nestjs/common";
import type { PrismaClient } from "@professionisti/database";
import { TimelineService } from "./timeline.service";

/** Chat: solo cliente e professionista che hanno davvero una richiesta in comune (docs/CHANGELOG.md §287). */
function service({ lead = false, quote = false, systemEvent = false } = {}) {
  const prisma = {
    guidedRequest: { findUnique: vi.fn().mockResolvedValue({ clientId: "cliente" }) },
    professionalProfile: { findUnique: vi.fn().mockResolvedValue({ userId: "professionista" }) },
    lead: { findUnique: vi.fn().mockResolvedValue(lead ? { id: "l" } : null) },
    quote: { findFirst: vi.fn().mockResolvedValue(quote ? { id: "q" } : null) },
    conversationEvent: {
      findFirst: vi.fn().mockResolvedValue(systemEvent ? { id: "e" } : null),
      findMany: vi.fn().mockResolvedValue([]),
    },
  };
  return new TimelineService(prisma as unknown as PrismaClient, {} as never, {} as never);
}

describe("accesso alla chat", () => {
  it("rifiuta un professionista a cui la richiesta non è mai arrivata", async () => {
    await expect(service().listForUser("professionista", "r", "p")).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("rifiuta il cliente verso un professionista qualsiasi", async () => {
    await expect(service().listForUser("cliente", "r", "p")).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("rifiuta chi non è nessuna delle due parti", async () => {
    await expect(service({ lead: true }).listForUser("altro", "r", "p")).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("apre la chat con una richiesta ricevuta, un preventivo o un evento del sistema", async () => {
    await expect(service({ lead: true }).listForUser("professionista", "r", "p")).resolves.toEqual([]);
    await expect(service({ quote: true }).listForUser("cliente", "r", "p")).resolves.toEqual([]);
    await expect(service({ systemEvent: true }).listForUser("cliente", "r", "p")).resolves.toEqual([]);
  });
});
