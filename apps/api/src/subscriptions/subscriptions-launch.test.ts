import { afterEach, describe, expect, it, vi } from "vitest";
import { SubscriptionsService } from "./subscriptions.service";

/**
 * Professionisti reclutati prima del lancio (docs/CHANGELOG.md §170): la loro
 * prova non deve finire prima del lancio, e accendere Stripe non deve
 * metterli in pausa finché il lancio non è fissato.
 */
function buildService() {
  const prisma = {
    subscription: {
      upsert: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 2 }),
      update: vi.fn(),
      aggregate: vi.fn().mockResolvedValue({ _max: { founderNumber: null } }),
    },
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

    await expect(service.syncPause("pro-1", new Date("2026-10-02T10:00:00Z"), 0)).resolves.toEqual({ reason: null, limitReached: false });
    expect(prisma.professionalProfile.update).not.toHaveBeenCalled();
  });

  it("dopo il lancio, con Stripe acceso, una prova finita mette in pausa", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test";
    process.env.LAUNCH_DATE = "2026-08-01";
    const { service, prisma } = buildService();
    prisma.professionalProfile.findUnique.mockResolvedValue(trialEnded);

    await expect(service.syncPause("pro-1", new Date("2026-10-02T10:00:00Z"), 0)).resolves.toEqual({ reason: "TRIAL_ENDED", limitReached: false });
  });

  it("al lancio allunga le prove iniziate prima, fino a un mese dopo il lancio", async () => {
    process.env.LAUNCH_DATE = "2026-11-02";
    const { service, prisma } = buildService();

    await expect(service.alignTrialsToLaunch(new Date("2026-11-03T10:00:00Z"))).resolves.toBe(4);
    // Prima i fondatori (tre mesi dal lancio, §359), poi gli altri (un mese).
    const founders = prisma.subscription.updateMany.mock.calls[0]![0];
    expect(founders.where.founderNumber).toEqual({ not: null });
    expect(founders.data.trialEndsAt.toISOString()).toBe("2027-01-30T23:00:00.000Z");
    const others = prisma.subscription.updateMany.mock.calls[1]![0];
    expect(others.where.status).toBe("TRIALING");
    expect(others.where.stripeSubscriptionId).toBeNull();
    expect(others.where.founderNumber).toBeNull();
    expect(others.where.createdAt.lt.toISOString()).toBe("2026-11-01T23:00:00.000Z");
    expect(others.data.trialEndsAt.toISOString()).toBe("2026-12-01T23:00:00.000Z");
  });

  it("prima del lancio non tocca le prove", async () => {
    process.env.LAUNCH_DATE = "2026-11-02";
    const { service, prisma } = buildService();

    await expect(service.alignTrialsToLaunch(new Date("2026-10-02T10:00:00Z"))).resolves.toBe(0);
    expect(prisma.subscription.updateMany).not.toHaveBeenCalled();
  });
});

/** Offerta di lancio (§359): 3 mesi gratis ai primi 100 professionisti. */
describe("SubscriptionsService e primi 100 professionisti", () => {
  const trialing = { id: "s-1", status: "TRIALING", stripeSubscriptionId: null, founderNumber: null, trialEndsAt: new Date("2026-12-01T23:00:00Z") };
  const profile = (overrides: Record<string, unknown> = {}) => ({ isDemo: false, deletedAt: null, invitePendingAt: null, subscription: trialing, ...overrides });

  it("prima del lancio dà il posto successivo e tre mesi dal lancio", async () => {
    process.env.LAUNCH_DATE = "2026-11-02";
    const { service, prisma } = buildService();
    prisma.professionalProfile.findUnique.mockResolvedValue(profile());
    prisma.subscription.aggregate.mockResolvedValue({ _max: { founderNumber: 41 } });

    await expect(service.claimFounderSpot("pro-1", new Date("2026-10-02T10:00:00Z"))).resolves.toBe(true);
    const data = prisma.subscription.update.mock.calls[0]![0].data;
    expect(data.founderNumber).toBe(42);
    expect(data.trialEndsAt.toISOString()).toBe("2027-01-30T23:00:00.000Z");
  });

  it("finiti i 100 posti resta il mese gratuito", async () => {
    const { service, prisma } = buildService();
    prisma.professionalProfile.findUnique.mockResolvedValue(profile());
    prisma.subscription.aggregate.mockResolvedValue({ _max: { founderNumber: 100 } });

    await expect(service.claimFounderSpot("pro-1")).resolves.toBe(false);
    expect(prisma.subscription.update).not.toHaveBeenCalled();
  });

  it("niente posto ai profili di prova, a quelli da confermare e a chi ha già un abbonamento", async () => {
    const { service, prisma } = buildService();
    for (const p of [profile({ isDemo: true }), profile({ invitePendingAt: new Date() }), profile({ subscription: { ...trialing, stripeSubscriptionId: "sub_1" } })]) {
      prisma.professionalProfile.findUnique.mockResolvedValueOnce(p);
      await expect(service.claimFounderSpot("pro-1")).resolves.toBe(false);
    }
    expect(prisma.subscription.update).not.toHaveBeenCalled();
  });

  it("chi ha già un posto lo tiene, senza prenderne un altro", async () => {
    const { service, prisma } = buildService();
    prisma.professionalProfile.findUnique.mockResolvedValue(profile({ subscription: { ...trialing, founderNumber: 7 } }));

    await expect(service.claimFounderSpot("pro-1")).resolves.toBe(true);
    expect(prisma.subscription.update).not.toHaveBeenCalled();
  });

  it("due iscrizioni insieme: la seconda riprova con il numero successivo", async () => {
    const { service, prisma } = buildService();
    prisma.professionalProfile.findUnique.mockResolvedValue(profile());
    prisma.subscription.aggregate.mockResolvedValueOnce({ _max: { founderNumber: 9 } }).mockResolvedValueOnce({ _max: { founderNumber: 10 } });
    prisma.subscription.update.mockRejectedValueOnce(Object.assign(new Error("unique"), { code: "P2002" })).mockResolvedValueOnce({});

    await expect(service.claimFounderSpot("pro-1")).resolves.toBe(true);
    expect(prisma.subscription.update.mock.calls[1]![0].data.founderNumber).toBe(11);
  });

  it("posti rimasti per la pagina prezzi", async () => {
    const { service, prisma } = buildService();
    prisma.subscription.aggregate.mockResolvedValue({ _max: { founderNumber: 37 } });

    await expect(service.founderSpots()).resolves.toEqual({ total: 100, left: 63 });
  });

  it("elenco per l'admin: prima del lancio i mesi gratis non hanno ancora una fine", async () => {
    process.env.LAUNCH_DATE = "2026-11-02";
    const { service, prisma } = buildService();
    Object.assign(prisma.subscription, {
      findMany: vi.fn().mockResolvedValue([
        {
          founderNumber: 1,
          plan: "PLUS",
          trialEndsAt: new Date("2027-01-30T23:00:00Z"),
          professionalProfile: { businessName: "Rossi Idraulica", city: "Latina", createdAt: new Date("2026-10-20T10:00:00Z"), deletedAt: null, user: { email: "rossi@example.com" } },
        },
      ]),
    });

    const list = await service.listFounders(new Date("2026-10-26T10:00:00Z"));
    expect(list).toMatchObject({ total: 100, taken: 1 });
    expect(list.rows[0]).toMatchObject({ number: 1, businessName: "Rossi Idraulica", freeUntil: null, tier: "PLUS", deleted: false });
  });
});
