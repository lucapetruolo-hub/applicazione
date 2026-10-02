import { afterEach, describe, expect, it, vi } from "vitest";
import { SubscriptionsService } from "./subscriptions.service";

/**
 * Professionisti reclutati prima del lancio (docs/CHANGELOG.md §169): la loro
 * prova non deve finire prima del lancio, e accendere Stripe non deve
 * metterli in pausa finché il lancio non è fissato.
 */
function buildService() {
  const prisma = {
    subscription: { upsert: vi.fn(), updateMany: vi.fn().mockResolvedValue({ count: 2 }) },
    professionalProfile: { findUnique: vi.fn(), update: vi.fn() },
    booking: { count: vi.fn().mockResolvedValue(0) },
  };
  const notificationsService = { notify: vi.fn() };
  const service = new SubscriptionsService(prisma as never, notificationsService as never);
  return { service, prisma, notificationsService };
}

const trialEnded = {
  userId: "u-1",
  isDemo: false,
  deletedAt: null,
  pausedReason: null,
  subscription: { plan: "FREE", status: "TRIALING", trialEndsAt: new Date("2026-09-01T00:00:00Z") },
};

afterEach(() => {
  delete process.env.STRIPE_SECRET_KEY;
  delete process.env.LAUNCH_DATE;
});

describe("SubscriptionsService e data di lancio", () => {
  it("la prova di chi si iscrive prima del lancio finisce un mese dopo il lancio", async () => {
    process.env.LAUNCH_DATE = "2026-11-02";
    const { service, prisma } = buildService();

    await service.ensureTrial("pro-1", new Date("2026-10-02T10:00:00Z"));

    expect(prisma.subscription.upsert.mock.calls[0]![0].create.trialEndsAt.toISOString()).toBe("2026-12-01T23:00:00.000Z");
  });

  it("con Stripe acceso ma senza data di lancio nessuno va in pausa", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test";
    const { service, prisma } = buildService();
    prisma.professionalProfile.findUnique.mockResolvedValue(trialEnded);

    await expect(service.syncPause("pro-1", new Date("2026-10-02T10:00:00Z"), 0)).resolves.toBeNull();
    expect(prisma.professionalProfile.update).not.toHaveBeenCalled();
  });

  it("dopo il lancio, con Stripe acceso, una prova finita mette in pausa", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test";
    process.env.LAUNCH_DATE = "2026-08-01";
    const { service, prisma } = buildService();
    prisma.professionalProfile.findUnique.mockResolvedValue(trialEnded);

    await expect(service.syncPause("pro-1", new Date("2026-10-02T10:00:00Z"), 0)).resolves.toBe("TRIAL_ENDED");
  });

  it("al lancio allunga le prove iniziate prima, fino a un mese dopo il lancio", async () => {
    process.env.LAUNCH_DATE = "2026-11-02";
    const { service, prisma } = buildService();

    await expect(service.alignTrialsToLaunch(new Date("2026-11-03T10:00:00Z"))).resolves.toBe(2);
    const where = prisma.subscription.updateMany.mock.calls[0]![0].where;
    expect(where.status).toBe("TRIALING");
    expect(where.stripeSubscriptionId).toBeNull();
    expect(where.createdAt.lt.toISOString()).toBe("2026-11-01T23:00:00.000Z");
    expect(prisma.subscription.updateMany.mock.calls[0]![0].data.trialEndsAt.toISOString()).toBe("2026-12-01T23:00:00.000Z");
  });

  it("prima del lancio non tocca le prove", async () => {
    process.env.LAUNCH_DATE = "2026-11-02";
    const { service, prisma } = buildService();

    await expect(service.alignTrialsToLaunch(new Date("2026-10-02T10:00:00Z"))).resolves.toBe(0);
    expect(prisma.subscription.updateMany).not.toHaveBeenCalled();
  });
});
