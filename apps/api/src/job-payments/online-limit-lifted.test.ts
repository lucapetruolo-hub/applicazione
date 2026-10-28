import { describe, expect, it, vi } from "vitest";
import { OnlineMoneyService } from "./online-money.service";

/**
 * Email "limite tolto" (docs/changelog/2026-10-28-tetto-pagamenti-online.md):
 * una volta sola, a chi non ha più il tetto ai pagamenti online.
 */
const NOW = new Date("2026-10-28T12:00:00.000Z");
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 86_400_000);
const cleanPayment = (paidDaysAgo: number) => ({
  releasedAt: daysAgo(1),
  depositPaidAt: daysAgo(paidDaysAgo),
  createdAt: daysAgo(paidDaysAgo),
  stripeDisputeId: null,
  stripeDisputeStatus: null,
  stripeDisputedAt: null,
  status: "CONFIRMED",
});

function setup(options: { removedAt?: Date | null; payments?: ReturnType<typeof cleanPayment>[]; claimed?: number }) {
  const prisma = {
    professionalProfile: {
      findMany: vi.fn().mockResolvedValue([{ id: "pro-1", userId: "user-1" }]),
      findUnique: vi.fn().mockResolvedValue({ onlineLimitRemovedAt: options.removedAt ?? null }),
      updateMany: vi.fn().mockResolvedValue({ count: options.claimed ?? 1 }),
    },
    jobPayment: { findMany: vi.fn().mockResolvedValue(options.payments ?? []) },
  };
  const notificationsService = { notify: vi.fn() };
  const service = new OnlineMoneyService(prisma as never, { record: vi.fn() } as never, notificationsService as never);
  return { prisma, notificationsService, service };
}

describe("notifyOnlineLimitsLifted", () => {
  it("avvisa chi ha 10 lavori e 120 giorni, e segna l'invio", async () => {
    const { prisma, notificationsService, service } = setup({ payments: Array.from({ length: 10 }, (_, i) => cleanPayment(130 - i)) });
    await expect(service.notifyOnlineLimitsLifted(NOW)).resolves.toBe(1);
    expect(prisma.professionalProfile.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ onlineLimitLiftNotifiedAt: null }) }));
    expect(prisma.professionalProfile.updateMany).toHaveBeenCalledWith({ where: { id: "pro-1", onlineLimitLiftNotifiedAt: null }, data: { onlineLimitLiftNotifiedAt: NOW } });
    expect(notificationsService.notify).toHaveBeenCalledWith("user-1", "ONLINE_LIMIT_LIFTED", { byAdmin: false });
  });

  it("avvisa chi ha il tetto tolto dall'admin", async () => {
    const { notificationsService, service } = setup({ removedAt: daysAgo(0) });
    await service.notifyOnlineLimitsLifted(NOW);
    expect(notificationsService.notify).toHaveBeenCalledWith("user-1", "ONLINE_LIMIT_LIFTED", { byAdmin: true });
  });

  it("niente email a chi ha ancora il tetto o se un altro giro l'ha già mandata", async () => {
    const stillLimited = setup({ payments: [cleanPayment(200)] });
    await expect(stillLimited.service.notifyOnlineLimitsLifted(NOW)).resolves.toBe(0);
    expect(stillLimited.prisma.professionalProfile.updateMany).not.toHaveBeenCalled();
    expect(stillLimited.notificationsService.notify).not.toHaveBeenCalled();

    const alreadySent = setup({ removedAt: daysAgo(0), claimed: 0 });
    await expect(alreadySent.service.notifyOnlineLimitsLifted(NOW)).resolves.toBe(0);
    expect(alreadySent.notificationsService.notify).not.toHaveBeenCalled();
  });
});
