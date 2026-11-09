import { describe, expect, it, vi } from "vitest";
import { AuthService } from "./auth.service";
import { sessionTokenPayload } from "./jwt-auth.guard";

function setup() {
  const prisma = {
    revokedSession: { upsert: vi.fn().mockResolvedValue({}), deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    user: { update: vi.fn().mockResolvedValue({}) },
  };
  const service = new AuthService(prisma as never, {} as never, {} as never, {} as never, {} as never);
  return { service, prisma };
}

describe("\"Esci\" chiude l'accesso sul server (controllo dell'08/11)", () => {
  it("ogni token nuovo ha un codice suo", () => {
    const a = sessionTokenPayload({ id: "u", sessionVersion: 0 });
    const b = sessionTokenPayload({ id: "u", sessionVersion: 0 });
    expect(a.jti).toBeTruthy();
    expect(a.jti).not.toBe(b.jti);
  });

  it("mette il codice tra gli accessi chiusi fino alla scadenza, senza toccare gli altri dispositivi", async () => {
    const { service, prisma } = setup();
    await service.logout("u", { jti: "abc", exp: 2_000_000_000 });
    expect(prisma.revokedSession.upsert).toHaveBeenCalledWith({
      where: { jti: "abc" },
      create: { jti: "abc", expiresAt: new Date(2_000_000_000 * 1000) },
      update: {},
    });
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("un token di prima, senza codice, chiude tutti gli accessi dell'account", async () => {
    const { service, prisma } = setup();
    await service.logout("u", {});
    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: "u" }, data: { sessionVersion: { increment: 1 } } });
  });
});
