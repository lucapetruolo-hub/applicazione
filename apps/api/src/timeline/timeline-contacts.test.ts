import { describe, expect, it, vi } from "vitest";
import { BadRequestException } from "@nestjs/common";
import type { PrismaClient } from "@professionisti/database";
import { TimelineService } from "./timeline.service";

/** Contatti in chat solo dopo l'accettazione (docs/changelog/2026-11-02-admin-protezioni.md). */
function service({ booked = false } = {}) {
  const create = vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: "e", createdAt: new Date(), automatic: false, ...data }));
  const prisma = {
    guidedRequest: { findUnique: vi.fn().mockResolvedValue({ clientId: "cliente", deletedByClientAt: null }) },
    professionalProfile: { findUnique: vi.fn().mockResolvedValue({ userId: "professionista", jobLimitReachedAt: null }) },
    lead: { findUnique: vi.fn().mockResolvedValue({ id: "l" }) },
    quote: { findFirst: vi.fn().mockResolvedValue(null) },
    booking: { findFirst: vi.fn().mockResolvedValue(booked ? { id: "b" } : null) },
    conversationEvent: { findFirst: vi.fn().mockResolvedValue(null), create },
  };
  const notifications = { notify: vi.fn().mockResolvedValue(undefined) };
  const realtime = { publish: vi.fn(), publishToUser: vi.fn() };
  return { svc: new TimelineService(prisma as unknown as PrismaClient, notifications as never, realtime as never), create };
}

describe("contatti in chat prima dell'accettazione", () => {
  it("blocca telefono, email, link e WhatsApp per il cliente e per il professionista, e dice cosa togliere", async () => {
    for (const [user, text, what] of [
      ["professionista", "chiamami al 333 123 4567", "il numero di telefono"],
      ["cliente", "scrivimi a mario.rossi@gmail.com", "l'indirizzo email"],
      ["professionista", "guarda www.mioSito.it", "il link"],
      ["cliente", "sentiamoci su WhatsApp", "il riferimento a WhatsApp"],
    ] as const) {
      const { svc, create } = service();
      const error = await svc.addUpdate(user, "r", "p", text, []).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as Error).message).toContain(`togli ${what}`);
      expect(create).not.toHaveBeenCalled();
    }
  });

  it("lascia passare un messaggio senza contatti e, dopo l'accettazione, anche i contatti", async () => {
    const free = service();
    await free.svc.addUpdate("cliente", "r", "p", "Passo il 12.11.2026 alle 9, costo 1.250 euro", []).catch(() => undefined);
    expect(free.create).toHaveBeenCalled();
    const booked = service({ booked: true });
    await booked.svc.addUpdate("professionista", "r", "p", "Il mio numero è 333 123 4567", []).catch(() => undefined);
    expect(booked.create).toHaveBeenCalled();
  });
});
