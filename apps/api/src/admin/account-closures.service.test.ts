import { describe, expect, it, vi } from "vitest";
import { AccountClosuresService } from "./account-closures.service";

/** Chiusura con preavviso e impronte email scadute (controllo pre-lancio 08/11, E4-03 ed E4-06). */
function build(due: { id: string; suspensionNote: string | null; suspensionGround: string | null }[], updated = 1) {
  const prisma = {
    user: {
      findMany: vi.fn().mockResolvedValue(due),
      updateMany: vi.fn().mockResolvedValue({ count: updated }),
    },
    professionalProfile: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
  };
  const notifications = { notify: vi.fn() };
  const audit = { record: vi.fn() };
  return { service: new AccountClosuresService(prisma as never, notifications as never, audit as never), prisma, notifications };
}

describe("AccountClosuresService", () => {
  it("chiude l'account arrivato alla data e manda l'email con fatti e regola", async () => {
    const { service, prisma, notifications } = build([{ id: "u1", suspensionNote: "Due account", suspensionGround: "termini-account" }]);
    const now = new Date("2026-12-08T04:30:00Z");
    expect(await service.closeDue(now)).toBe(1);
    expect(prisma.user.updateMany).toHaveBeenCalledWith({ where: { id: "u1", closureScheduledAt: { lte: now }, suspendedAt: null }, data: { suspendedAt: now } });
    expect(prisma.professionalProfile.updateMany).toHaveBeenCalledWith({ where: { userId: "u1", suspendedAt: null }, data: { suspendedAt: now } });
    expect(notifications.notify).toHaveBeenCalledWith("u1", "ACCOUNT_CLOSED", { note: "Due account", ground: "termini-account" });
  });

  it("non chiude se nel frattempo un admin ha annullato la chiusura", async () => {
    const { service, notifications } = build([{ id: "u1", suspensionNote: null, suspensionGround: null }], 0);
    expect(await service.closeDue(new Date())).toBe(0);
    expect(notifications.notify).not.toHaveBeenCalled();
  });

  it("cancella le impronte email degli account chiusi da più di 10 anni", async () => {
    const { service, prisma } = build([]);
    await service.clearOldEmailHashes(new Date("2036-11-08T00:00:00Z"));
    expect(prisma.user.updateMany).toHaveBeenCalledWith({
      where: { deletedEmailHash: { not: null }, deletedAt: { lt: new Date("2026-11-08T00:00:00Z") } },
      data: { deletedEmailHash: null },
    });
  });
});
