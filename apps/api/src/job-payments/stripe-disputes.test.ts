import { describe, expect, it, vi } from "vitest";
import { OnlineMoneyService } from "./online-money.service";

/**
 * Contestazioni in banca e stato dell'account del professionista
 * (docs/CHANGELOG.md §236): con una contestazione aperta i soldi non
 * partono, e prima di ogni trasferimento lo stato dell'account si rilegge
 * da Stripe (Accounts v2) invece di fidarsi solo del webhook.
 */
function buildService(transfersStatus = "active") {
  const prisma = {
    jobPayment: { findUnique: vi.fn(), findFirst: vi.fn(), findUniqueOrThrow: vi.fn(), update: vi.fn(), updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    manoviaRevenue: { create: vi.fn() },
    professionalFiscalProfile: { updateMany: vi.fn() },
    professionalProfile: { update: vi.fn(), updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
    user: { findMany: vi.fn().mockResolvedValue([{ id: "admin-1", adminRoles: [] }]) },
  };
  const auditLogService = { record: vi.fn() };
  const notificationsService = { notify: vi.fn() };
  const stripe = {
    transfers: { create: vi.fn().mockResolvedValue({ id: "tr_1" }) },
    refunds: { create: vi.fn() },
    paymentIntents: { retrieve: vi.fn() },
    accounts: { retrieve: vi.fn().mockResolvedValue({ capabilities: { transfers: transfersStatus } }) },
    v2: { core: { accounts: { retrieve: vi.fn().mockResolvedValue({ requirements: { entries: [] } }) } } },
  };
  const service = new OnlineMoneyService(prisma as never, auditLogService as never, notificationsService as never);
  (service as unknown as { stripe: unknown }).stripe = stripe;
  return { service, prisma, stripe, notificationsService };
}

function paidJob(overrides: Record<string, unknown> = {}) {
  return {
    id: "jp-1",
    bookingId: "bk-1",
    paymentMethod: "MANOVIA",
    status: "PENDING",
    onlineStage: "PAID",
    releasedAt: null,
    releaseDueAt: null,
    paidEurCents: 40000,
    refundedEurCents: 0,
    stripeFeeEurCents: 600,
    platformFeeEurCents: 2000,
    stripePaymentIntentId: "pi_dep",
    balancePaymentIntentId: "pi_bal",
    stripeTransferId: null,
    stripeDisputeId: null,
    stripeDisputeStatus: null,
    stripeDisputedAt: null,
    netAmountEurCents: 0,
    booking: {
      id: "bk-1",
      professionalProfileId: "pro-1",
      clientId: "client-1",
      finalAmountEurCents: 40000,
      professionalCompletedAt: new Date("2026-10-01T10:00:00Z"),
      clientConfirmedCompletedAt: new Date("2026-10-01T12:00:00Z"),
      issue: null,
      professionalProfile: { id: "pro-1", userId: "pro-user-1", fiscalProfile: { stripeConnectAccountId: "acct_1", stripePayoutsEnabled: false } },
      quote: { guidedRequestId: "gr-1" },
    },
    ...overrides,
  };
}

const dispute = (status: string, amount = 8000) => ({ id: "dp_1", payment_intent: "pi_dep", amount, status, reason: "product_not_received" });

describe("Stato dell'account Stripe prima del trasferimento", () => {
  it("trasferisce se Stripe dice che l'account è attivo, anche se il webhook non era arrivato", async () => {
    const { service, prisma, stripe } = buildService("active");
    prisma.jobPayment.findUnique.mockResolvedValue(paidJob());

    await expect(service.releaseIfDue("jp-1")).resolves.toBe(true);

    expect(stripe.accounts.retrieve).toHaveBeenCalledWith("acct_1");
    expect(stripe.transfers.create).toHaveBeenCalledTimes(1);
  });

  it("non trasferisce se l'account non può ancora ricevere", async () => {
    const { service, prisma, stripe, notificationsService } = buildService("pending");
    prisma.jobPayment.findUnique.mockResolvedValue(paidJob());

    await expect(service.releaseIfDue("jp-1")).resolves.toBe(false);

    expect(stripe.transfers.create).not.toHaveBeenCalled();
    expect(notificationsService.notify).toHaveBeenCalledWith("pro-user-1", "JOB_PAYOUT_ACCOUNT_NEEDED", expect.anything());
  });
});

describe("OnlineMoneyService.handleStripeDispute", () => {
  it("con una contestazione aperta l'accredito resta bloccato", async () => {
    const { service, prisma, stripe } = buildService();
    prisma.jobPayment.findUnique.mockResolvedValue(paidJob({ stripeDisputeId: "dp_1", stripeDisputeStatus: "needs_response" }));

    await expect(service.releaseIfDue("jp-1")).resolves.toBe(false);
    expect(stripe.transfers.create).not.toHaveBeenCalled();
  });

  it("all'apertura segna il pagamento come contestato e avvisa team e professionista una volta", async () => {
    const { service, prisma, notificationsService } = buildService();
    prisma.jobPayment.findFirst.mockResolvedValue(paidJob());

    await expect(service.handleStripeDispute(dispute("needs_response") as never)).resolves.toBe(true);

    expect(prisma.jobPayment.update).toHaveBeenCalledWith({
      where: { id: "jp-1" },
      data: expect.objectContaining({ stripeDisputeId: "dp_1", stripeDisputeStatus: "needs_response", status: "DISPUTED" }),
    });
    expect(prisma.jobPayment.updateMany).toHaveBeenCalledWith({ where: { id: "jp-1", stripeDisputeId: null }, data: { stripeDisputeId: "dp_1", stripeDisputedAt: expect.any(Date) } });
    expect(notificationsService.notify).toHaveBeenCalledWith("admin-1", "ADMIN_STRIPE_DISPUTE", expect.anything());
    expect(notificationsService.notify).toHaveBeenCalledWith("pro-user-1", "JOB_STRIPE_DISPUTE", expect.anything());
  });

  it("un aggiornamento intermedio non manda altri avvisi", async () => {
    const { service, prisma, notificationsService } = buildService();
    prisma.jobPayment.findFirst.mockResolvedValue(paidJob({ stripeDisputeId: "dp_1", stripeDisputeStatus: "needs_response" }));

    await service.handleStripeDispute(dispute("under_review") as never);

    expect(notificationsService.notify).not.toHaveBeenCalled();
  });

  it("contestazione persa: la cifra conta come restituita al cliente, una volta sola", async () => {
    const { service, prisma } = buildService();
    prisma.jobPayment.findFirst.mockResolvedValue(paidJob({ stripeDisputeId: "dp_1", stripeDisputeStatus: "under_review" }));

    await service.handleStripeDispute(dispute("lost") as never);

    expect(prisma.jobPayment.update).toHaveBeenCalledWith({
      where: { id: "jp-1" },
      data: expect.objectContaining({ stripeDisputeStatus: "lost", refundedEurCents: 8000, status: "PENDING" }),
    });
    // Il tetto ai pagamenti online torna, anche se l'admin l'aveva tolto (docs/changelog/2026-10-28-tetto-pagamenti-online.md).
    expect(prisma.professionalProfile.update).toHaveBeenCalledWith({
      where: { id: "pro-1" },
      data: { onlineLimitRemovedAt: null, onlineLimitLiftNotifiedAt: null },
    });

    prisma.jobPayment.update.mockClear();
    prisma.jobPayment.findFirst.mockResolvedValue(paidJob({ stripeDisputeId: "dp_1", stripeDisputeStatus: "lost", refundedEurCents: 8000 }));
    await service.handleStripeDispute(dispute("lost") as never);
    expect(prisma.jobPayment.update.mock.calls[0]![0].data).not.toHaveProperty("refundedEurCents");
  });

  it("due notizie di chiusura quasi insieme: un solo avviso e un solo rimborso (prova dal vivo del 29/10)", async () => {
    const { service, prisma, notificationsService } = buildService();
    // Tutte e due hanno letto il pagamento ancora aperto; solo la prima riesce a segnarlo chiuso.
    prisma.jobPayment.findFirst.mockResolvedValue(paidJob({ stripeDisputeId: "dp_1", stripeDisputeStatus: "under_review" }));
    prisma.jobPayment.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });

    await service.handleStripeDispute(dispute("lost") as never);
    await service.handleStripeDispute(dispute("lost") as never);

    const proNotices = notificationsService.notify.mock.calls.filter((c) => c[1] === "JOB_STRIPE_DISPUTE");
    expect(proNotices).toHaveLength(1);
    const refundWrites = prisma.jobPayment.update.mock.calls.filter((c) => "refundedEurCents" in c[0].data);
    expect(refundWrites).toHaveLength(1);
    expect(refundWrites[0]![0].data.refundedEurCents).toBe(8000);
  });

  it("una notizia in ritardo non riapre una contestazione chiusa", async () => {
    const { service, prisma, notificationsService } = buildService();
    prisma.jobPayment.findFirst.mockResolvedValue(paidJob({ stripeDisputeId: "dp_1", stripeDisputeStatus: "won" }));

    await expect(service.handleStripeDispute(dispute("under_review") as never)).resolves.toBe(true);

    expect(prisma.jobPayment.update).not.toHaveBeenCalled();
    expect(notificationsService.notify).not.toHaveBeenCalled();
  });

  it("contestazione persa sull'intero importo: pagamento chiuso come rimborsato", async () => {
    const { service, prisma } = buildService();
    prisma.jobPayment.findFirst.mockResolvedValue(paidJob({ paidEurCents: 8000, stripeDisputeId: "dp_1", stripeDisputeStatus: "under_review" }));

    await service.handleStripeDispute(dispute("lost") as never);

    expect(prisma.jobPayment.update).toHaveBeenCalledWith({
      where: { id: "jp-1" },
      data: expect.objectContaining({ status: "REFUNDED", onlineStage: "REFUNDED", refundedEurCents: 8000 }),
    });
  });

  it("restituisce false se il pagamento contestato non è di un lavoro", async () => {
    const { service, prisma } = buildService();
    prisma.jobPayment.findFirst.mockResolvedValue(null);

    await expect(service.handleStripeDispute(dispute("needs_response") as never)).resolves.toBe(false);
  });
});
