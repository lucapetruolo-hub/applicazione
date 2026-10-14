import { describe, expect, it, vi } from "vitest";
import { onlineApplicationFeeHoldEurCents } from "@professionisti/shared";
import { OnlineMoneyService } from "./online-money.service";

/**
 * Soldi bloccati sul conto Stripe del professionista (docs/CHANGELOG.md
 * §243): addebito a destinazione con trattenuta, bonifici manuali sbloccati
 * dal sito, rimborsi ripresi dal suo conto. Ogni chiamata a Stripe è finta e
 * controllata, perché un errore qui vuol dire soldi non bloccati, bonifici
 * doppi o un conto del professionista in negativo.
 */
function buildService() {
  const prisma = {
    jobPayment: { findUnique: vi.fn(), findUniqueOrThrow: vi.fn(), update: vi.fn(), updateMany: vi.fn().mockResolvedValue({ count: 1 }), findMany: vi.fn().mockResolvedValue([]) },
    professionalFiscalProfile: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    booking: { findUnique: vi.fn() },
    manoviaRevenue: { create: vi.fn() },
    professionalProfile: { findUnique: vi.fn() },
    quote: { findUnique: vi.fn() },
    user: { findMany: vi.fn().mockResolvedValue([]) },
  };
  const auditLogService = { record: vi.fn() };
  const notificationsService = { notify: vi.fn() };
  const stripe = {
    v2: { core: { accounts: { retrieve: vi.fn().mockResolvedValue({ configuration: { recipient: { capabilities: { stripe_balance: { stripe_transfers: { status: "active" } } } } }, requirements: { entries: [] } }) } } },
    balanceSettings: { update: vi.fn() },
    checkout: { sessions: { create: vi.fn().mockResolvedValue({ url: "https://checkout.stripe.test/s" }) } },
    balance: { retrieve: vi.fn() },
    payouts: { create: vi.fn().mockResolvedValue({ id: "po_1" }) },
    transfers: { create: vi.fn(), createReversal: vi.fn() },
    applicationFees: { createRefund: vi.fn() },
    refunds: { create: vi.fn() },
    paymentIntents: { retrieve: vi.fn() },
  };
  const service = new OnlineMoneyService(prisma as never, auditLogService as never, notificationsService as never);
  (service as unknown as { stripe: unknown }).stripe = stripe;
  return { service, prisma, stripe, notificationsService };
}

function releasedJob(overrides: Record<string, unknown> = {}) {
  return {
    id: "jp-1",
    bookingId: "bk-1",
    paymentMethod: "MANOVIA",
    onlineStage: "RELEASED",
    releasedAt: new Date("2026-10-10T10:00:00Z"),
    stripeDestinationAccountId: "acct_1",
    paidEurCents: 10000,
    refundedEurCents: 0,
    applicationFeeEurCents: 675,
    payoutPendingEurCents: 9325,
    payoutSentEurCents: 0,
    payoutFailedAt: null,
    stripePaymentIntentId: "pi_dep",
    balancePaymentIntentId: null,
    netAmountEurCents: 9325,
    booking: { id: "bk-1", professionalProfile: { userId: "pro-user-1" }, quote: { guidedRequestId: "gr-1" } },
    ...overrides,
  };
}

describe("trattenuta sul pagamento", () => {
  it("copre commissione del 5% e costo massimo della carta, mai più dell'importo", () => {
    // 5% di 100 € = 5 €, carta al massimo 3,25% + 0,25 € = 3,50 €.
    expect(onlineApplicationFeeHoldEurCents(10000)).toBe(850);
    expect(onlineApplicationFeeHoldEurCents(10)).toBe(10);
  });
});

describe("OnlineMoneyService.createQuoteDepositCheckout", () => {
  it("addebita sul conto del professionista e mette in manuale i suoi bonifici prima del primo pagamento", async () => {
    const { service, prisma, stripe } = buildService();
    prisma.professionalFiscalProfile.findUnique.mockResolvedValue({ id: "fp-1", stripeConnectAccountId: "acct_1", stripePayoutsEnabled: true, stripeManualPayoutsAt: null });

    await service.createQuoteDepositCheckout({ clientUserId: "c-1", quoteId: "q-1", guidedRequestId: "gr-1", paymentMethod: "ONLINE", amountEurCents: 10000, businessName: "Rossi Impianti", professionalProfileId: "pro-1" });

    expect(stripe.balanceSettings.update).toHaveBeenCalledWith({ payments: { payouts: { schedule: { interval: "manual" } } } }, { stripeAccount: "acct_1" });
    expect(stripe.checkout.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({ payment_intent_data: expect.objectContaining({ transfer_data: { destination: "acct_1" }, application_fee_amount: 850 }) }),
    );
  });

  it("non fa partire il pagamento se i bonifici non si possono bloccare", async () => {
    const { service, prisma, stripe } = buildService();
    prisma.professionalFiscalProfile.findUnique.mockResolvedValue({ id: "fp-1", stripeConnectAccountId: "acct_1", stripePayoutsEnabled: true, stripeManualPayoutsAt: null });
    stripe.balanceSettings.update.mockRejectedValue(new Error("Stripe non risponde"));

    await expect(
      service.createQuoteDepositCheckout({ clientUserId: "c-1", quoteId: "q-1", guidedRequestId: "gr-1", paymentMethod: "ONLINE", amountEurCents: 10000, businessName: "Rossi", professionalProfileId: "pro-1" }),
    ).rejects.toThrow("non può ricevere pagamenti online");
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });
});

describe("OnlineMoneyService.recordCheckoutPayment", () => {
  it("registra il conto del professionista e restituisce subito la parte di trattenuta oltre il costo reale della carta", async () => {
    const { service, prisma, stripe } = buildService();
    const job = { id: "jp-1", bookingId: "bk-1", paymentMethod: "MANOVIA", paidEurCents: 0, refundedEurCents: 0, stripeFeeEurCents: 0, applicationFeeEurCents: 0, stripePaymentIntentId: null, balancePaymentIntentId: null, balanceDirect: false, depositEurCents: 10000, releasedAt: null, booking: { finalAmountEurCents: null, professionalProfileId: "pro-1", quoteId: null } };
    prisma.jobPayment.findUnique.mockResolvedValue(job);
    prisma.jobPayment.findUniqueOrThrow.mockResolvedValue({ ...job, applicationFeeEurCents: 850, stripePaymentIntentId: "pi_dep" });
    stripe.paymentIntents.retrieve.mockImplementation(async (_pi: string, opts: { expand: string[] }) =>
      opts.expand[0] === "latest_charge.application_fee"
        ? { latest_charge: { application_fee: { id: "fee_1", amount: 850, amount_refunded: 0 } } }
        : { transfer_data: { destination: "acct_1" }, latest_charge: { id: "ch_1", application_fee_amount: 850, balance_transaction: { fee: 175 } } },
    );

    await service.recordCheckoutPayment("jp-1", "deposit", { payment_intent: "pi_dep", amount_total: 10000 } as never, { notify: false });

    expect(prisma.jobPayment.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ stripeDestinationAccountId: "acct_1", applicationFeeEurCents: 850, stripeFeeEurCents: 175 }) }),
    );
    // Trattenuto 8,50 €, dovuti 5 € di commissione + 1,75 € di carta: tornano 1,75 €.
    expect(stripe.applicationFees.createRefund).toHaveBeenCalledWith("fee_1", expect.objectContaining({ amount: 175 }), { idempotencyKey: "job-fee-return-fee_1-0-175" });
  });
});

describe("OnlineMoneyService.sendPayout", () => {
  it("fa partire il bonifico una volta sola, dal conto del professionista", async () => {
    const { service, prisma, stripe } = buildService();
    prisma.jobPayment.findUnique.mockResolvedValue(releasedJob());
    stripe.balance.retrieve.mockResolvedValue({ available: [{ amount: 9325, currency: "eur" }], pending: [] });

    await expect(service.sendPayout("jp-1")).resolves.toBe(true);
    expect(stripe.payouts.create).toHaveBeenCalledTimes(1);
    expect(stripe.payouts.create).toHaveBeenCalledWith(expect.objectContaining({ amount: 9325, currency: "eur" }), {
      stripeAccount: "acct_1",
      idempotencyKey: "job-payout-jp-1-0-9325",
    });
  });

  it("non usa i soldi ancora bloccati per altri lavori", async () => {
    const { service, prisma, stripe } = buildService();
    prisma.jobPayment.findUnique.mockResolvedValue(releasedJob());
    stripe.balance.retrieve.mockResolvedValue({ available: [{ amount: 15000, currency: "eur" }], pending: [] });
    // Un altro lavoro dello stesso professionista, pagato e ancora bloccato.
    prisma.jobPayment.findMany.mockResolvedValue([{ releasedAt: null, paidEurCents: 8000, refundedEurCents: 0, applicationFeeEurCents: 540, payoutPendingEurCents: 0 }]);

    await expect(service.sendPayout("jp-1")).resolves.toBe(false);
    expect(stripe.payouts.create).not.toHaveBeenCalled();
  });

  it("con i soldi ancora in arrivo su Stripe aspetta il giro dopo, senza avvisare", async () => {
    const { service, prisma, stripe, notificationsService } = buildService();
    prisma.jobPayment.findUnique.mockResolvedValue(releasedJob());
    stripe.balance.retrieve.mockResolvedValue({ available: [], pending: [{ amount: 9325, currency: "eur" }] });

    await expect(service.sendPayout("jp-1")).resolves.toBe(false);
    expect(stripe.payouts.create).not.toHaveBeenCalled();
    expect(notificationsService.notify).not.toHaveBeenCalled();
  });

  it("se la banca rifiuta, rimette in attesa il bonifico e avvisa il professionista", async () => {
    const { service, prisma, notificationsService } = buildService();
    prisma.jobPayment.findUnique.mockResolvedValue(releasedJob({ payoutPendingEurCents: 0, payoutSentEurCents: 9325, stripePayoutId: "po_1" }));
    prisma.jobPayment.updateMany.mockResolvedValue({ count: 1 });

    await service.handlePayoutEvent({ id: "po_1", status: "failed", amount: 9325, failure_message: "Conto chiuso.", metadata: { jobPaymentId: "jp-1" } } as never);

    expect(prisma.jobPayment.updateMany).toHaveBeenCalledWith({
      where: { id: "jp-1", stripePayoutId: "po_1" },
      data: expect.objectContaining({ stripePayoutId: null, payoutPendingEurCents: { increment: 9325 }, payoutSentEurCents: { decrement: 9325 } }),
    });
    expect(notificationsService.notify).toHaveBeenCalledWith("pro-user-1", "JOB_PAYOUT_FAILED", expect.objectContaining({ amountEurCents: 9325 }));
  });
});

describe("OnlineMoneyService.releaseIfDue con i soldi sul conto del professionista", () => {
  it("non trasferisce nulla: restituisce il conguaglio della trattenuta e prepara il bonifico", async () => {
    const { service, prisma, stripe } = buildService();
    const job = {
      ...releasedJob({ onlineStage: "PAID", releasedAt: null, payoutPendingEurCents: 0, netAmountEurCents: 0, applicationFeeEurCents: 675, stripeFeeEurCents: 175, platformFeeEurCents: 400, releaseDueAt: null }),
      booking: {
        id: "bk-1",
        clientId: "client-1",
        finalAmountEurCents: 8000,
        professionalCompletedAt: new Date("2026-10-01T10:00:00Z"),
        clientConfirmedCompletedAt: new Date("2026-10-01T12:00:00Z"),
        issue: null,
        professionalProfile: { id: "pro-1", userId: "pro-user-1", fiscalProfile: { stripeConnectAccountId: "acct_1", stripePayoutsEnabled: true } },
        quote: { guidedRequestId: "gr-1" },
      },
    };
    prisma.jobPayment.findUnique.mockResolvedValueOnce(job).mockResolvedValue(releasedJob({ payoutPendingEurCents: 0 }));
    // Dopo il rimborso dei 20 € in più al cliente: pagati 100 €, rimborsati 20 €.
    const afterRefund = { ...job, refundedEurCents: 2000, applicationFeeEurCents: 675 };
    prisma.jobPayment.findUniqueOrThrow.mockResolvedValue(afterRefund);
    prisma.jobPayment.update.mockResolvedValue(afterRefund);
    stripe.paymentIntents.retrieve.mockImplementation(async (_pi: string, opts: { expand: string[] }) =>
      opts.expand[0] === "latest_charge.application_fee"
        ? { latest_charge: { application_fee: { id: "fee_1", amount: 850, amount_refunded: 175 } } }
        : { transfer_data: { destination: "acct_1" }, latest_charge: { amount: 10000, amount_refunded: 0 } },
    );

    await expect(service.releaseIfDue("jp-1")).resolves.toBe(true);

    expect(stripe.transfers.create).not.toHaveBeenCalled();
    // La differenza torna al cliente, ripresa dal conto del professionista.
    expect(stripe.refunds.create).toHaveBeenCalledWith(expect.objectContaining({ payment_intent: "pi_dep", amount: 2000, reverse_transfer: true }), expect.anything());
    // Restano 80 €: dovuti 4 € di commissione + 1,75 € di carta = 5,75 €, trattenuti 6,75 €: torna 1 €.
    expect(stripe.applicationFees.createRefund).toHaveBeenCalledWith("fee_1", expect.objectContaining({ amount: 100 }), expect.anything());
    expect(prisma.jobPayment.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ onlineStage: "RELEASED", payoutPendingEurCents: 8000 - 575 }) }),
    );
  });
});

describe("OnlineMoneyService.refundOnline con i soldi sul conto del professionista", () => {
  it("con un rimborso totale riprende tutto dal suo conto e restituisce tutta la trattenuta", async () => {
    const { service, prisma, stripe } = buildService();
    const job = releasedJob({ onlineStage: "DEPOSIT_PAID", releasedAt: null, payoutPendingEurCents: 0, netAmountEurCents: 0 });
    prisma.jobPayment.findUnique.mockResolvedValue(job);
    prisma.jobPayment.findUniqueOrThrow.mockResolvedValueOnce(job).mockResolvedValueOnce(job).mockResolvedValue({ ...job, refundedEurCents: 10000 });
    prisma.jobPayment.update.mockResolvedValue({ ...job, refundedEurCents: 10000 });
    stripe.paymentIntents.retrieve.mockImplementation(async (_pi: string, opts: { expand: string[] }) =>
      opts.expand[0] === "latest_charge.application_fee"
        ? { latest_charge: { application_fee: { id: "fee_1", amount: 850, amount_refunded: 175 } } }
        : { transfer_data: { destination: "acct_1" }, latest_charge: { amount: 10000, amount_refunded: 0 } },
    );

    await expect(service.refundOnline("jp-1", "ALL", "Lavoro annullato.", "client-1")).resolves.toBe(10000);

    expect(stripe.refunds.create).toHaveBeenCalledWith(expect.objectContaining({ amount: 10000, reverse_transfer: true }), expect.anything());
    expect(stripe.applicationFees.createRefund).toHaveBeenCalledWith("fee_1", expect.objectContaining({ amount: 675 }), expect.anything());
    expect(stripe.transfers.createReversal).not.toHaveBeenCalled();
  });
});
