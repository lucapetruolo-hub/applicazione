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
      findUnique: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      updateMany: vi.fn().mockResolvedValue({ count: 2 }),
      update: vi.fn(),
      aggregate: vi.fn().mockResolvedValue({ _max: { founderNumber: null } }),
      count: vi.fn().mockResolvedValue(0),
    },
    subscriptionOffer: {
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: "offer-new", ...data })),
      update: vi.fn().mockImplementation(({ where, data }) => Promise.resolve({ id: where.id, ...data })),
    },
    professionalProfile: { findUnique: vi.fn(), update: vi.fn(), count: vi.fn().mockResolvedValue(0) },
    user: { count: vi.fn().mockResolvedValue(0) },
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
};

const DAY = 24 * 60 * 60 * 1000;

afterEach(() => {
  delete process.env.STRIPE_SECRET_KEY;
  delete process.env.LAUNCH_DATE;
});

describe("SubscriptionsService e data di lancio", () => {
  it("senza offerte create: 3 mesi gratis dal lancio per chi si iscrive prima", async () => {
    process.env.LAUNCH_DATE = "2026-11-02";
    const { service, prisma } = buildService();

    await service.ensureTrial("pro-1", new Date("2026-10-02T10:00:00Z"));

    const create = prisma.subscription.upsert.mock.calls[0]![0].create;
    expect(create.trialEndsAt.toISOString()).toBe("2027-01-30T23:00:00.000Z");
    expect(create.freeMonthsGranted).toBe(3);
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

  it("dopo il lancio i mesi gratis senza carta mettono in pausa finché non la dà", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test";
    process.env.LAUNCH_DATE = "2026-08-01";
    const { service, prisma, notificationsService } = buildService();
    prisma.professionalProfile.findUnique.mockResolvedValue({ ...trialEnded, subscription: { ...trialEnded.subscription, trialEndsAt: new Date("2026-12-01T00:00:00Z") } });

    await expect(service.syncPause("pro-1", new Date("2026-10-02T10:00:00Z"), 0)).resolves.toEqual({ reason: "CARD_NEEDED", limitReached: false });
    expect(notificationsService.notify).toHaveBeenCalledWith("u-1", "SUBSCRIPTION_PAUSED", { reason: "CARD_NEEDED" });
  });

  it("al lancio porta i mesi gratis senza carta iniziati prima alla fine giusta, secondo i mesi di ognuno", async () => {
    process.env.LAUNCH_DATE = "2026-11-02";
    const { service, prisma } = buildService();
    prisma.subscription.findMany.mockResolvedValue([
      { id: "s-3", trialEndsAt: new Date("2026-11-02T00:00:00Z"), freeMonthsGranted: 3 },
      { id: "s-1", trialEndsAt: new Date("2026-11-02T00:00:00Z"), freeMonthsGranted: 1 },
      { id: "s-ok", trialEndsAt: new Date("2027-02-01T00:00:00Z"), freeMonthsGranted: 3 },
    ]);

    await expect(service.alignTrialsToLaunch(new Date("2026-11-03T10:00:00Z"))).resolves.toBe(2);
    const where = prisma.subscription.findMany.mock.calls[0]![0].where;
    expect(where).toMatchObject({ status: "TRIALING", stripeSubscriptionId: null });
    expect(where.createdAt.lt.toISOString()).toBe("2026-11-01T23:00:00.000Z");
    expect(prisma.subscription.update.mock.calls.map((call) => [call[0].where.id, call[0].data.trialEndsAt.toISOString()])).toEqual([
      ["s-3", "2027-01-30T23:00:00.000Z"],
      ["s-1", "2026-12-01T23:00:00.000Z"],
    ]);
  });

  it("prima del lancio non tocca i mesi gratis", async () => {
    process.env.LAUNCH_DATE = "2026-11-02";
    const { service, prisma } = buildService();

    await expect(service.alignTrialsToLaunch(new Date("2026-10-02T10:00:00Z"))).resolves.toBe(0);
    expect(prisma.subscription.findMany).not.toHaveBeenCalled();
  });
});

/** Offerta dei mesi gratis decisa in Admin (docs/changelog/2026-10-29-offerta-mesi-gratis.md). */
describe("SubscriptionsService e offerta dei mesi gratis", () => {
  const now = new Date("2026-12-10T10:00:00Z");

  it("offerta attiva da 1 mese: un mese gratis a chi si iscrive", async () => {
    process.env.LAUNCH_DATE = "2026-11-02";
    const { service, prisma } = buildService();
    prisma.subscriptionOffer.findFirst.mockResolvedValue({ id: "offer-1", freeMonths: 1, startedAt: new Date("2026-12-01T00:00:00Z"), stoppedAt: null });

    await service.ensureTrial("pro-1", now);

    const create = prisma.subscription.upsert.mock.calls[0]![0].create;
    expect(create).toMatchObject({ freeMonthsGranted: 1, offerId: "offer-1" });
    expect(create.trialEndsAt.toISOString()).toBe("2027-01-09T10:00:00.000Z");
  });

  it("offerta fermata: nessun mese gratis per chi arriva dopo", async () => {
    process.env.LAUNCH_DATE = "2026-11-02";
    const { service, prisma } = buildService();
    prisma.subscriptionOffer.findFirst.mockResolvedValue({ id: "offer-1", freeMonths: 3, startedAt: new Date(0), stoppedAt: new Date("2026-12-01T00:00:00Z") });

    await service.ensureTrial("pro-1", now);

    const create = prisma.subscription.upsert.mock.calls[0]![0].create;
    expect(create.freeMonthsGranted).toBe(0);
    expect(create.trialEndsAt.toISOString()).toBe(now.toISOString());
  });

  it("chi ha già la riga non cambia mesi", async () => {
    const { service, prisma } = buildService();
    prisma.subscription.findUnique.mockResolvedValue({ id: "s-1" });

    await service.ensureTrial("pro-1", now);
    expect(prisma.subscription.upsert).not.toHaveBeenCalled();
  });

  it("fermare l'offerta di partenza la scrive nello storico; una nuova ferma quella attiva", async () => {
    const { service, prisma, auditLogService } = buildService();

    await service.stopOffer("admin-1", now);
    expect(prisma.subscriptionOffer.create.mock.calls[0]![0].data).toMatchObject({ freeMonths: 3, stoppedAt: now, stoppedByUserId: "admin-1" });
    expect(auditLogService.record).toHaveBeenCalledWith(expect.objectContaining({ entityType: "SubscriptionOffer", newValue: "STOPPED" }));

    prisma.subscriptionOffer.findFirst.mockResolvedValue({ id: "offer-2", freeMonths: 2, startedAt: now, stoppedAt: null });
    await service.startOffer("admin-1", 1, now);
    expect(prisma.subscriptionOffer.update.mock.calls[0]![0]).toMatchObject({ where: { id: "offer-2" }, data: { stoppedAt: now } });
    expect(prisma.subscriptionOffer.create.mock.calls[1]![0].data).toMatchObject({ freeMonths: 1, createdByUserId: "admin-1" });
  });

  it("offerta già ferma o mesi fuori misura: errore", async () => {
    const { service, prisma } = buildService();
    await expect(service.startOffer("admin-1", 0, now)).rejects.toThrow("da 1 a 12");
    prisma.subscriptionOffer.findFirst.mockResolvedValue({ id: "offer-1", freeMonths: 3, startedAt: new Date(0), stoppedAt: now });
    await expect(service.stopOffer("admin-1", now)).rejects.toThrow("già ferma");
  });

  it("passaggio a Plus nel secondo mese gratis: un mese in attesa, periodo nuovo da oggi", async () => {
    vi.useFakeTimers({ now, toFake: ["Date"] });
    const { service, prisma } = buildService();
    prisma.subscription.findUnique.mockResolvedValue({ id: "s-1", professionalProfileId: "pro-1", stripeSubscriptionId: "sub_1", status: "ACTIVE", trialEndsAt: new Date(now.getTime() + 50 * DAY), freeMonthsGranted: 3, freeMonthsWaiting: 0 });
    prisma.professionalProfile.findUnique.mockResolvedValue(null);

    await service.applyStripeSubscription({ stripeSubscriptionId: "sub_1", status: "ACTIVE", tier: "PLUS", interval: "MONTH", cancelAtPeriodEnd: false, currentPeriodStart: now, currentPeriodEnd: new Date(now.getTime() + 31 * DAY), stripeTrialEnd: null });

    expect(prisma.subscription.update.mock.calls[0]![0].data).toMatchObject({ plan: "PLUS", trialEndsAt: now, freeMonthsWaiting: 1 });
    vi.useRealTimers();
  });

  it("ritorno a Base con mesi in attesa: il nuovo giro vale quei mesi", async () => {
    vi.useFakeTimers({ now, toFake: ["Date"] });
    const { service, prisma } = buildService();
    const trialEnd = new Date(now.getTime() + 60 * DAY);
    prisma.subscription.findUnique.mockResolvedValue({ id: "s-1", professionalProfileId: "pro-1", stripeSubscriptionId: "sub_1", status: "ACTIVE", trialEndsAt: new Date(now.getTime() - 20 * DAY), freeMonthsGranted: 3, freeMonthsWaiting: 2 });
    prisma.professionalProfile.findUnique.mockResolvedValue(null);

    await service.applyStripeSubscription({ stripeSubscriptionId: "sub_1", status: "ACTIVE", tier: "BASE", interval: "MONTH", cancelAtPeriodEnd: false, currentPeriodEnd: trialEnd, stripeTrialEnd: trialEnd });

    expect(prisma.subscription.update.mock.calls[0]![0].data).toMatchObject({ plan: "BASE", trialEndsAt: trialEnd, freeMonthsWaiting: 0, freeMonthsGranted: 2 });
    vi.useRealTimers();
  });
});

/** Posti numerati dell'offerta di lancio (§363): restano per la scritta "100 posti". */
describe("SubscriptionsService e primi 100 professionisti", () => {
  const trialing = { id: "s-1", status: "TRIALING", stripeSubscriptionId: null, founderNumber: null, trialEndsAt: new Date("2026-12-01T23:00:00Z") };
  const profile = (overrides: Record<string, unknown> = {}) => ({ isDemo: false, deletedAt: null, invitePendingAt: null, subscription: trialing, user: { testAccountAt: null }, ...overrides });

  it("dà il posto successivo senza toccare i mesi gratis (li dà l'offerta)", async () => {
    process.env.LAUNCH_DATE = "2026-11-02";
    const { service, prisma } = buildService();
    prisma.professionalProfile.findUnique.mockResolvedValue(profile());
    prisma.subscription.aggregate.mockResolvedValue({ _max: { founderNumber: 41 } });

    await expect(service.claimFounderSpot("pro-1", new Date("2026-10-02T10:00:00Z"))).resolves.toBe(true);
    expect(prisma.subscription.update.mock.calls[0]![0].data).toEqual({ founderNumber: 42 });
  });

  it("finiti i 100 posti nessun numero", async () => {
    const { service, prisma } = buildService();
    prisma.professionalProfile.findUnique.mockResolvedValue(profile());
    prisma.subscription.count.mockResolvedValue(100);
    prisma.subscription.aggregate.mockResolvedValue({ _max: { founderNumber: 100 } });

    await expect(service.claimFounderSpot("pro-1")).resolves.toBe(false);
    expect(prisma.subscription.update).not.toHaveBeenCalled();
  });

  it("niente posto ai profili di prova, a quelli da confermare e a chi ha finito i mesi gratis", async () => {
    const { service, prisma } = buildService();
    for (const p of [profile({ isDemo: true }), profile({ user: { testAccountAt: new Date() } }), profile({ invitePendingAt: new Date() }), profile({ subscription: { ...trialing, status: "CANCELED" } })]) {
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

    await expect(service.founderSpots()).resolves.toEqual({ total: 100, left: 63, offerMonths: 3 });
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
