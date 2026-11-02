import { afterEach, describe, expect, it, vi } from "vitest";
import { SubscriptionsService } from "./subscriptions.service";

/**
 * Mesi gratis una volta per persona o impresa (richiesta di Luca del
 * 2/11/2026, docs/changelog/2026-11-02-collaudo-recensioni-abusi.md).
 */
function build(row: Record<string, unknown> | null) {
  const prisma = {
    subscription: {
      findUnique: vi.fn().mockResolvedValue(row),
      update: vi.fn(),
    },
    professionalProfile: {
      findUnique: vi.fn().mockResolvedValue(null),
      update: vi.fn(),
    },
  };
  const notificationsService = { notify: vi.fn() };
  const auditLogService = { record: vi.fn() };
  const service = new SubscriptionsService(
    prisma as never,
    notificationsService as never,
    auditLogService as never,
  );
  const endStripeTrial = vi.fn().mockResolvedValue(undefined);
  service.setStripeTrialEnder(endStripeTrial);
  return {
    service,
    prisma,
    notificationsService,
    auditLogService,
    endStripeTrial,
  };
}

const base = {
  id: "sub-2",
  status: "TRIALING",
  freeMonthsGranted: 3,
  freeMonthsWaiting: 0,
  stripeSubscriptionId: null,
  professionalProfile: { userId: "user-2" },
};

afterEach(() => {
  delete process.env.LAUNCH_DATE;
});

describe("SubscriptionsService.revokeUsedFreeMonths", () => {
  it("prima del lancio, con la carta: i mesi gratis finiscono al lancio, mai un addebito prima", async () => {
    process.env.LAUNCH_DATE = "2026-12-01";
    const now = new Date("2026-11-02T10:00:00Z");
    const { service, prisma, notificationsService, endStripeTrial } = build({
      ...base,
      status: "ACTIVE",
      stripeSubscriptionId: "sub_stripe",
      trialEndsAt: new Date("2027-03-01T00:00:00Z"),
    });

    expect(await service.revokeUsedFreeMonths("pro-2", now)).toBe(true);

    const launch = new Date("2026-11-30T23:00:00.000Z");
    expect(prisma.subscription.update).toHaveBeenCalledWith({
      where: { id: "sub-2" },
      data: { freeMonthsGranted: 0, freeMonthsWaiting: 0, trialEndsAt: launch },
    });
    expect(endStripeTrial).toHaveBeenCalledWith("sub_stripe", launch);
    expect(notificationsService.notify).toHaveBeenCalledWith(
      "user-2",
      "SUBSCRIPTION_FREE_MONTHS_USED",
      expect.objectContaining({
        date: launch.toISOString(),
        launched: false,
        card: true,
      }),
    );
  });

  it("dopo il lancio: finiscono oggi, anche quelli in attesa", async () => {
    process.env.LAUNCH_DATE = "2026-10-01";
    const now = new Date("2026-11-02T10:00:00Z");
    const { service, prisma, notificationsService, endStripeTrial } = build({
      ...base,
      freeMonthsWaiting: 2,
      trialEndsAt: new Date("2027-01-01T00:00:00Z"),
    });

    await service.revokeUsedFreeMonths("pro-2", now);

    expect(prisma.subscription.update.mock.calls[0]![0].data).toEqual({
      freeMonthsGranted: 0,
      freeMonthsWaiting: 0,
      trialEndsAt: now,
    });
    // Senza carta non c'è una prova su Stripe da chiudere.
    expect(endStripeTrial).not.toHaveBeenCalled();
    expect(notificationsService.notify.mock.calls[0]![2]).toMatchObject({
      date: null,
      launched: true,
      card: false,
    });
  });

  it("nessun mese gratis da togliere: niente avviso", async () => {
    const { service, prisma, notificationsService } = build({
      ...base,
      freeMonthsGranted: 0,
      trialEndsAt: null,
    });

    expect(await service.revokeUsedFreeMonths("pro-2")).toBe(false);
    expect(prisma.subscription.update).not.toHaveBeenCalled();
    expect(notificationsService.notify).not.toHaveBeenCalled();
  });
});
