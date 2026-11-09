import { describe, expect, it, vi } from "vitest";
import { ForbiddenException } from "@nestjs/common";
import type { PrismaClient } from "@professionisti/database";
import { TimelineService } from "./timeline.service";

/**
 * Lavori esauriti (§362): il professionista non risponde per primo, tranne a
 * un cliente arrivato dal suo link personale
 * (docs/changelog/2026-11-08-canale-del-professionista.md).
 */
function service(fromProfessionalLink: boolean) {
  const create = vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: "e", createdAt: new Date(), automatic: false, ...data }));
  const prisma = {
    guidedRequest: {
      findUnique: vi.fn().mockResolvedValue({ clientId: "cliente", deletedByClientAt: null, fromProfessionalLink, professionalProfileId: "p" }),
    },
    professionalProfile: { findUnique: vi.fn().mockResolvedValue({ userId: "professionista", jobLimitReachedAt: new Date() }) },
    lead: { findUnique: vi.fn().mockResolvedValue({ id: "l" }) },
    quote: { findFirst: vi.fn().mockResolvedValue(null) },
    booking: { findFirst: vi.fn().mockResolvedValue(null) },
    conversationEvent: { findFirst: vi.fn().mockResolvedValue(null), create },
  };
  const notifications = { notify: vi.fn().mockResolvedValue(undefined) };
  const realtime = { publish: vi.fn(), publishToUser: vi.fn() };
  return { svc: new TimelineService(prisma as unknown as PrismaClient, notifications as never, realtime as never), create };
}

describe("prima risposta con i lavori esauriti", () => {
  it("ferma la risposta a una richiesta del sito", async () => {
    const { svc, create } = service(false);
    const error = await svc.addUpdate("professionista", "r", "p", "Buongiorno, passo domani", []).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ForbiddenException);
    expect(create).not.toHaveBeenCalled();
  });

  it("lascia rispondere a un cliente del suo link", async () => {
    const { svc, create } = service(true);
    await svc.addUpdate("professionista", "r", "p", "Buongiorno, passo domani", []).catch(() => undefined);
    expect(create).toHaveBeenCalled();
  });
});
