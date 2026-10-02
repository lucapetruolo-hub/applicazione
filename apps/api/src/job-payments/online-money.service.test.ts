import { describe, expect, it, vi } from "vitest";
import { OnlineMoneyService } from "./online-money.service";

/**
 * Flusso del denaro dei pagamenti online (docs/CHANGELOG.md §169): accredito
 * al professionista, nuovi tentativi e rimborsi. Un bug qui significa soldi
 * pagati due volte o soldi persi, quindi ogni chiamata a Stripe è finta e
 * controllata: quante volte parte e con quale chiave di idempotenza.
 */
function buildService() {
  const prisma = {
    jobPayment: { findUnique: vi.fn(), findUniqueOrThrow: vi.fn(), update: vi.fn(), updateMany: vi.fn(), findMany: vi.fn() },
    manoviaRevenue: { create: vi.fn() },
    professionalProfile: { findUnique: vi.fn() },
    quote: { findUnique: vi.fn() },
    user: { findMany: vi.fn().mockResolvedValue([]) },
  };
  const auditLogService = { record: vi.fn() };
  const notificationsService = { notify: vi.fn() };
  const stripe = {
    transfers: { create: vi.fn().mockResolvedValue({ id: "tr_1" }), createReversal: vi.fn() },
    refunds: { create: vi.fn() },
    paymentIntents: { retrieve: vi.fn() },
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
    netAmountEurCents: 0,
    booking: {
      id: "bk-1",
      clientId: "client-1",
      finalAmountEurCents: 40000,
      professionalCompletedAt: new Date("2026-10-01T10:00:00Z"),
      clientConfirmedCompletedAt: new Date("2026-10-01T12:00:00Z"),
      issue: null,
      professionalProfile: { id: "pro-1", userId: "pro-user-1", fiscalProfile: { stripeConnectAccountId: "acct_1", stripePayoutsEnabled: true } },
      quote: { guidedRequestId: "gr-1" },
    },
    ...overrides,
  };
}

describe("OnlineMoneyService.releaseIfDue", () => {
  it("trasferisce una volta sola, con chiave di idempotenza legata al pagamento", async () => {
    const { service, prisma, stripe } = buildService();
    prisma.jobPayment.findUnique.mockResolvedValue(paidJob());
    prisma.jobPayment.updateMany.mockResolvedValue({ count: 1 });

    await expect(service.releaseIfDue("jp-1")).resolves.toBe(true);

    expect(stripe.transfers.create).toHaveBeenCalledTimes(1);
    expect(stripe.transfers.create).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 40000 - 600 - 2000, destination: "acct_1" }),
      { idempotencyKey: "job-release-jp-1" },
    );
  });

  it("non trasferisce se un altro giro ha già preso in carico il pagamento", async () => {
    const { service, prisma, stripe } = buildService();
    prisma.jobPayment.findUnique.mockResolvedValue(paidJob());
    prisma.jobPayment.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.releaseIfDue("jp-1")).resolves.toBe(false);
    expect(stripe.transfers.create).not.toHaveBeenCalled();
  });

  it("non trasferisce un pagamento già accreditato", async () => {
    const { service, prisma, stripe } = buildService();
    prisma.jobPayment.findUnique.mockResolvedValue(paidJob({ releasedAt: new Date() }));

    await expect(service.releaseIfDue("jp-1")).resolves.toBe(false);
    expect(prisma.jobPayment.updateMany).not.toHaveBeenCalled();
    expect(stripe.transfers.create).not.toHaveBeenCalled();
  });

  it("non trasferisce con una segnalazione aperta", async () => {
    const { service, prisma, stripe } = buildService();
    const job = paidJob();
    prisma.jobPayment.findUnique.mockResolvedValue({ ...job, booking: { ...job.booking, issue: { status: "OPEN" } } });

    await expect(service.releaseIfDue("jp-1")).resolves.toBe(false);
    expect(stripe.transfers.create).not.toHaveBeenCalled();
  });

  it("se il trasferimento è partito e poi il database fallisce, non rimette il pagamento in coda", async () => {
    const { service, prisma, stripe } = buildService();
    prisma.jobPayment.findUnique.mockResolvedValue(paidJob());
    prisma.jobPayment.updateMany.mockResolvedValue({ count: 1 });
    prisma.jobPayment.update.mockRejectedValueOnce(new Error("database non raggiungibile"));

    await expect(service.releaseIfDue("jp-1")).resolves.toBe(true);
    expect(stripe.transfers.create).toHaveBeenCalledTimes(1);
    expect(prisma.jobPayment.update).not.toHaveBeenCalledWith(expect.objectContaining({ data: { releasedAt: null } }));
  });

  it("se il trasferimento fallisce, rimette il pagamento in coda per il giro successivo", async () => {
    const { service, prisma, stripe } = buildService();
    prisma.jobPayment.findUnique.mockResolvedValue(paidJob());
    prisma.jobPayment.updateMany.mockResolvedValue({ count: 1 });
    stripe.transfers.create.mockRejectedValueOnce(new Error("Stripe non risponde"));

    await expect(service.releaseIfDue("jp-1")).resolves.toBe(false);
    expect(prisma.jobPayment.update).toHaveBeenCalledWith({ where: { id: "jp-1" }, data: { releasedAt: null } });
  });

  it("senza conto Stripe del professionista tiene i soldi in custodia e lo avvisa", async () => {
    const { service, prisma, stripe, notificationsService } = buildService();
    const job = paidJob();
    prisma.jobPayment.findUnique.mockResolvedValue({
      ...job,
      booking: { ...job.booking, professionalProfile: { ...job.booking.professionalProfile, fiscalProfile: null } },
    });

    await expect(service.releaseIfDue("jp-1")).resolves.toBe(false);
    expect(stripe.transfers.create).not.toHaveBeenCalled();
    expect(notificationsService.notify).toHaveBeenCalledWith("pro-user-1", "JOB_PAYOUT_ACCOUNT_NEEDED", expect.anything());
  });
});

describe("OnlineMoneyService.handleCheckoutCompleted", () => {
  it("ignora un pagamento già registrato", async () => {
    const { service, prisma } = buildService();
    prisma.jobPayment.findUnique.mockResolvedValue(paidJob({ stripePaymentIntentId: "pi_dep" }));

    await service.handleCheckoutCompleted({ metadata: { jobPaymentId: "jp-1", part: "deposit" }, payment_intent: "pi_dep", amount_total: 8000 } as never);

    expect(prisma.jobPayment.update).not.toHaveBeenCalled();
  });
});

describe("OnlineMoneyService.refundOnline", () => {
  it("rimborsa con chiavi di idempotenza, prima il saldo poi l'acconto", async () => {
    const { service, prisma, stripe } = buildService();
    const job = paidJob({ paidEurCents: 40000, refundedEurCents: 0 });
    prisma.jobPayment.findUnique.mockResolvedValue(job);
    prisma.jobPayment.findUniqueOrThrow.mockResolvedValueOnce(job).mockResolvedValueOnce({ ...job, refundedEurCents: 40000 });
    stripe.paymentIntents.retrieve.mockImplementation(async (pi: string) => ({
      latest_charge: { amount: pi === "pi_bal" ? 32000 : 8000, amount_refunded: 0 },
    }));

    await expect(service.refundOnline("jp-1", "ALL", "Segnalazione accolta.", "admin-1")).resolves.toBe(40000);

    expect(stripe.refunds.create).toHaveBeenNthCalledWith(1, expect.objectContaining({ payment_intent: "pi_bal", amount: 32000 }), {
      idempotencyKey: "job-refund-pi_bal-0-32000",
    });
    expect(stripe.refunds.create).toHaveBeenNthCalledWith(2, expect.objectContaining({ payment_intent: "pi_dep", amount: 8000 }), {
      idempotencyKey: "job-refund-pi_dep-0-8000",
    });
  });

  it("riprende dal conto del professionista quanto già accreditato", async () => {
    const { service, prisma, stripe } = buildService();
    const job = paidJob({ stripeTransferId: "tr_1", netAmountEurCents: 37400 });
    prisma.jobPayment.findUnique.mockResolvedValue(job);
    prisma.jobPayment.findUniqueOrThrow.mockResolvedValueOnce(job).mockResolvedValueOnce({ ...job, refundedEurCents: 40000 });
    stripe.paymentIntents.retrieve.mockResolvedValue({ latest_charge: { amount: 40000, amount_refunded: 0 } });

    await service.refundOnline("jp-1", "ALL", "Segnalazione accolta.", "admin-1");

    expect(stripe.transfers.createReversal).toHaveBeenCalledWith("tr_1", { amount: 37400 }, { idempotencyKey: "job-reversal-tr_1-0" });
  });
});
