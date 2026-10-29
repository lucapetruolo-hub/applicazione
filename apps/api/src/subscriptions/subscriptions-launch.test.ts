import { afterEach, describe, expect, it, vi } from "vitest";
import { SubscriptionsService } from "./subscriptions.service";

/**
 * Professionisti reclutati prima del lancio (docs/CHANGELOG.md §170): la loro
 * prova non deve finire prima del lancio, e accendere Stripe non deve
 * metterli in pausa finché il lancio non è fissato.
 */
function buildService(paidFrom: Date | null = new Date("2026-08-01T00:00:00Z")) {
  const prisma = {
    subscriptionSettings: {
      findFirst: vi.fn().mockResolvedValue(paidFrom ? { id: "set-1", paidFrom } : null),
      update: vi.fn().mockResolvedValue({ id: "set-1" }),
      create: vi.fn().mockResolvedValue({ id: "set-1" }),
    },
    subscription: {
      upsert: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 2 }),
      update: vi.fn(),
      aggregate: vi.fn().mockResolvedValue({ _max: { founderNumber: null } }),
      count: vi.fn().mockResolvedValue(0),
    },
    professionalProfile: { findUnique: vi.fn(), update: vi.fn(), findMany: vi.fn().mockResolvedValue([]) },
    booking: { count: vi.fn().mockResolvedValue(0) },
  };
  const notificationsService = { notify: vi.fn() };
  const auditLogService = { record: vi.fn() };
  const service = new SubscriptionsService(prisma as never, notificationsService as never, auditLogService as never);
  return { service, prisma, notificationsService, auditLogService };
}

const trialEnded = {
  userId: "u-1",
  isDemo: false,
  deletedAt: null,
  pausedReason: null,
  subscription: { plan: "FREE", status: "TRIALING", trialEndsAt: new Date("2026-09-01T00:00:00Z") },
  user: { testAccountAt: null },
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
    // Prima i fondatori (tre mesi dal lancio, §363), poi gli altri (un mese).
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

/** Offerta di lancio (§363): 3 mesi gratis ai primi 100 professionisti. */
describe("SubscriptionsService e primi 100 professionisti", () => {
  const trialing = { id: "s-1", status: "TRIALING", stripeSubscriptionId: null, founderNumber: null, trialEndsAt: new Date("2026-12-01T23:00:00Z") };
  const profile = (overrides: Record<string, unknown> = {}) => ({ isDemo: false, deletedAt: null, invitePendingAt: null, subscription: trialing, user: { testAccountAt: null }, ...overrides });

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
    prisma.subscription.count.mockResolvedValue(100);
    prisma.subscription.aggregate.mockResolvedValue({ _max: { founderNumber: 100 } });

    await expect(service.claimFounderSpot("pro-1")).resolves.toBe(false);
    expect(prisma.subscription.update).not.toHaveBeenCalled();
  });

  it("niente posto ai profili di prova, a quelli da confermare e a chi ha già un abbonamento", async () => {
    const { service, prisma } = buildService();
    for (const p of [profile({ isDemo: true }), profile({ user: { testAccountAt: new Date() } }), profile({ invitePendingAt: new Date() }), profile({ subscription: { ...trialing, stripeSubscriptionId: "sub_1" } })]) {
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
    prisma.subscription.count.mockResolvedValue(37);

    await expect(service.founderSpots()).resolves.toEqual({ total: 100, left: 63 });
  });

  it("un posto liberato da un account di prova torna disponibile (§395)", async () => {
    const { service, prisma } = buildService();
    prisma.professionalProfile.findUnique.mockResolvedValue(profile());
    // 99 posti presi, ma l'ultimo numero è 100: il 100 era di un account di prova, ora libero.
    prisma.subscription.count.mockResolvedValue(99);
    prisma.subscription.aggregate.mockResolvedValue({ _max: { founderNumber: 100 } });

    await expect(service.claimFounderSpot("pro-1")).resolves.toBe(true);
    expect(prisma.subscription.update.mock.calls[0]![0].data.founderNumber).toBe(101);
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

/**
 * Gratis finché l'admin non accende gli abbonamenti a pagamento (richiesta di
 * Luca del 29/10/2026, docs/changelog/2026-10-29-abbonamenti-a-pagamento-da-admin.md).
 */
describe("SubscriptionsService e abbonamenti a pagamento accesi dall'admin", () => {
  it("spenti: dopo il lancio una prova finita non mette in pausa", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test";
    process.env.LAUNCH_DATE = "2026-08-01";
    const { service, prisma } = buildService(null);
    prisma.professionalProfile.findUnique.mockResolvedValue(trialEnded);

    await expect(service.syncPause("pro-1", new Date("2026-10-02T10:00:00Z"), 0)).resolves.toEqual({ reason: null, limitReached: false });
    expect(prisma.professionalProfile.update).not.toHaveBeenCalled();
  });

  it("spenti: un account di prova va in pausa lo stesso, per il collaudo", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test";
    process.env.LAUNCH_DATE = "2026-08-01";
    const { service, prisma } = buildService(null);
    prisma.professionalProfile.findUnique.mockResolvedValue({ ...trialEnded, user: { testAccountAt: new Date() } });

    await expect(service.syncPause("pro-1", new Date("2026-10-02T10:00:00Z"), 0)).resolves.toEqual({ reason: "TRIAL_ENDED", limitReached: false });
  });

  it("spenti: niente avvisi di fine prova né mese regalato, tranne agli account di prova", async () => {
    process.env.LAUNCH_DATE = "2026-08-01";
    const { service, prisma } = buildService(null);
    Object.assign(prisma.subscription, { findMany: vi.fn().mockResolvedValue([]) });

    await service.runTrialCheck(new Date("2026-10-02T10:00:00Z"));
    expect((prisma.subscription as unknown as { findMany: ReturnType<typeof vi.fn> }).findMany.mock.calls[0]![0].where.professionalProfile).toEqual({
      deletedAt: null,
      user: { testAccountAt: { not: null } },
    });
  });

  it("accesi da un giorno: nessuna prova finisce prima e ognuno riceve l'avviso con la sua data", async () => {
    const { service, prisma, notificationsService, auditLogService } = buildService(null);
    Object.assign(prisma.subscription, {
      findMany: vi.fn().mockResolvedValue([
        { founderNumber: 3, trialEndsAt: new Date("2027-01-30T23:00:00Z"), professionalProfile: { userId: "u-1" } },
        { founderNumber: null, trialEndsAt: new Date("2026-11-30T23:00:00Z"), professionalProfile: { userId: "u-2" } },
      ]),
    });
    prisma.subscriptionSettings.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(null).mockResolvedValue({ id: "set-1", paidFrom: new Date("2026-11-30T23:00:00Z") });

    await service.setPaidFrom("admin-1", "2026-12-01", new Date("2026-11-10T10:00:00Z"));

    expect(prisma.subscriptionSettings.create.mock.calls[0]![0].data.paidFrom.toISOString()).toBe("2026-11-30T23:00:00.000Z");
    const align = prisma.subscription.updateMany.mock.calls[0]![0];
    expect(align.where).toMatchObject({ status: "TRIALING", stripeSubscriptionId: null });
    expect(align.data).toEqual({ trialEndsAt: new Date("2026-11-30T23:00:00Z"), trialEndingNotifiedAt: null });
    expect(notificationsService.notify).toHaveBeenCalledWith("u-1", "SUBSCRIPTION_PAID_START", { date: "2027-01-30T23:00:00.000Z", founder: true });
    expect(notificationsService.notify).toHaveBeenCalledWith("u-2", "SUBSCRIPTION_PAID_START", { date: "2026-11-30T23:00:00.000Z", founder: false });
    expect(auditLogService.record).toHaveBeenCalledWith(expect.objectContaining({ fieldName: "paidFrom", newValue: "2026-11-30T23:00:00.000Z" }));
  });

  it("accesi: il giorno deve essere ad almeno 14 giorni da oggi", async () => {
    const { service, prisma } = buildService(null);

    await expect(service.setPaidFrom("admin-1", "2026-11-20", new Date("2026-11-10T10:00:00Z"))).rejects.toThrow("almeno 14 giorni");
    expect(prisma.subscriptionSettings.create).not.toHaveBeenCalled();
  });

  it("rispenti prima della data: avviso che resta tutto gratis", async () => {
    const { service, prisma, notificationsService } = buildService(new Date("2026-12-01T00:00:00Z"));
    Object.assign(prisma.subscription, { findMany: vi.fn().mockResolvedValue([{ founderNumber: null, professionalProfile: { userId: "u-2" } }]) });

    await service.setPaidFrom("admin-1", null, new Date("2026-11-10T10:00:00Z"));

    expect(prisma.subscriptionSettings.update.mock.calls[0]![0].data.paidFrom).toBeNull();
    expect(notificationsService.notify).toHaveBeenCalledWith("u-2", "SUBSCRIPTION_PAID_START_POSTPONED", {});
  });

  it("accesi: chi si iscrive dopo ha il periodo gratuito almeno fino al giorno scelto", async () => {
    const { service, prisma } = buildService(new Date("2027-02-01T00:00:00Z"));

    await service.ensureTrial("pro-1", new Date("2026-12-01T10:00:00Z"));
    expect(prisma.subscription.upsert.mock.calls[0]![0].create.trialEndsAt.toISOString()).toBe("2027-02-01T00:00:00.000Z");
  });
});
