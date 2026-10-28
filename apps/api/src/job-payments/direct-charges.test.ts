import { describe, expect, it, vi } from "vitest";
import { accountDebitGrossEurCents, estimatedCardFeeEurCents } from "@professionisti/shared";
import { OnlineMoneyService } from "./online-money.service";

/**
 * Addebito diretto sul conto Stripe del professionista (docs/CHANGELOG.md
 * §268, decisione dell'utente del 20/10/2026): pagamenti, rimborsi e
 * contestazioni stanno sul suo conto, così Stripe prende rimborsi e
 * contestazioni dal suo saldo e non da quello della piattaforma. Ogni
 * chiamata a Stripe è finta e controllata.
 */
function buildService() {
  const prisma = {
    jobPayment: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(1),
    },
    refund: { count: vi.fn().mockResolvedValue(0) },
    professionalFiscalProfile: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    booking: { findUnique: vi.fn(), findFirst: vi.fn().mockResolvedValue({ professionalProfileId: "pro-1" }) },
    manoviaRevenue: { create: vi.fn() },
    platformFeeEntry: { upsert: vi.fn() },
    professionalProfile: { findUnique: vi.fn(), updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
    quote: { findUnique: vi.fn() },
    user: { findMany: vi.fn().mockResolvedValue([]) },
  };
  const stripe = {
    v2: {
      core: {
        accounts: {
          retrieve: vi.fn().mockResolvedValue({
            configuration: {
              merchant: { capabilities: { card_payments: { status: "active" } } },
              recipient: { capabilities: { stripe_balance: { stripe_transfers: { status: "active" } } } },
            },
            requirements: { entries: [] },
          }),
        },
      },
    },
    balanceSettings: { update: vi.fn() },
    checkout: { sessions: { create: vi.fn().mockResolvedValue({ url: "https://checkout.stripe.test/s" }) } },
    balance: { retrieve: vi.fn().mockResolvedValue({ available: [{ amount: 100000, currency: "eur" }], pending: [] }) },
    payouts: { create: vi.fn().mockResolvedValue({ id: "po_1" }) },
    transfers: { create: vi.fn(), createReversal: vi.fn(), retrieve: vi.fn() },
    applicationFees: { createRefund: vi.fn(), retrieve: vi.fn().mockResolvedValue({ id: "fee_1", amount: 850, amount_refunded: 175 }) },
    refunds: { create: vi.fn().mockResolvedValue({ id: "re_1", amount: 10000, status: "succeeded" }), update: vi.fn() },
    charges: { create: vi.fn().mockResolvedValue({ id: "py_1" }) },
    paymentIntents: {
      retrieve: vi.fn().mockResolvedValue({ latest_charge: { id: "ch_1", amount: 10000, amount_refunded: 0, application_fee: "fee_1" } }),
      create: vi.fn(),
    },
  };
  const service = new OnlineMoneyService(prisma as never, { record: vi.fn() } as never, { notify: vi.fn() } as never);
  (service as unknown as { stripe: unknown }).stripe = stripe;
  return { service, prisma, stripe };
}

/** Lavoro pagato 100 € con addebito diretto, sbloccato: 93,25 € al professionista, 6,75 € trattenuti. */
function directJob(overrides: Record<string, unknown> = {}) {
  return {
    id: "jp-1",
    bookingId: "bk-1",
    paymentMethod: "MANOVIA",
    onlineStage: "RELEASED",
    releasedAt: new Date("2026-10-10T10:00:00Z"),
    stripeDestinationAccountId: "acct_1",
    stripeDirectCharge: true,
    paidEurCents: 10000,
    refundedEurCents: 0,
    applicationFeeEurCents: 675,
    payoutPendingEurCents: 9325,
    payoutSentEurCents: 0,
    payoutFailedAt: null,
    stripePaymentIntentId: "pi_dep",
    balancePaymentIntentId: null,
    netAmountEurCents: 9325,
    disputeRecoveredEurCents: 0,
    disputeReturnTransferId: null,
    professionalDebtEurCents: 0,
    platformFeeEurCents: 500,
    stripeFeeEurCents: 175,
    booking: { id: "bk-1", professionalProfile: { userId: "pro-user-1" }, quote: { guidedRequestId: "gr-1" } },
    ...overrides,
  };
}

function toRelease(overrides: Record<string, unknown> = {}) {
  return {
    ...directJob({ onlineStage: "PAID", releasedAt: null, payoutPendingEurCents: 0, netAmountEurCents: 0, releaseDueAt: null, ...overrides }),
    booking: {
      id: "bk-1",
      clientId: "client-1",
      finalAmountEurCents: 10000,
      professionalCompletedAt: new Date("2026-10-01T10:00:00Z"),
      clientConfirmedCompletedAt: new Date("2026-10-01T12:00:00Z"),
      issue: null,
      professionalProfile: { id: "pro-1", userId: "pro-user-1", fiscalProfile: { stripeConnectAccountId: "acct_1", stripePayoutsEnabled: true } },
      quote: { guidedRequestId: "gr-1" },
    },
  };
}

describe("costi stimati dal listino Stripe (§268)", () => {
  it("stima il costo della carta dal tipo di carta, al massimo quello trattenuto", () => {
    expect(estimatedCardFeeEurCents(10000, { country: "IT", regulatedStatus: "regulated" })).toBe(175);
    expect(estimatedCardFeeEurCents(10000, { country: "DE", regulatedStatus: "unregulated" })).toBe(305);
    expect(estimatedCardFeeEurCents(10000, { country: "GB", regulatedStatus: null })).toBe(275);
    expect(estimatedCardFeeEurCents(10000, { country: "US", regulatedStatus: null })).toBe(340);
    expect(estimatedCardFeeEurCents(10000, null)).toBe(350);
  });

  it("il prelievo dal conto del professionista include l'1,4% di Stripe", () => {
    expect(accountDebitGrossEurCents(1231)).toBe(1249);
    expect(accountDebitGrossEurCents(0)).toBe(0);
  });
});

describe("pagamenti sul conto del professionista", () => {
  it("il saldo di un lavoro iniziato con l'addebito a destinazione resta a destinazione", async () => {
    const { service, prisma, stripe } = buildService();
    prisma.booking.findUnique.mockResolvedValue({
      id: "bk-1",
      clientId: "client-1",
      status: "COMPLETED",
      finalAmountEurCents: 10000,
      professionalProfileId: "pro-1",
      quote: { guidedRequestId: "gr-1" },
      professionalProfile: { businessName: "Rossi" },
      jobPayment: directJob({ stripeDirectCharge: false, onlineStage: "AWAITING_BALANCE", paidEurCents: 2000, releasedAt: null, balanceDirect: false, depositEurCents: 2000 }),
    });
    prisma.professionalFiscalProfile.findUnique.mockResolvedValue({ id: "fp-1", stripeConnectAccountId: "acct_1", stripePayoutsEnabled: true, stripeManualPayoutsAt: new Date(), stripeNegativeDebitAt: new Date() });

    await service.createCheckout("client-1", "bk-1", "balance");

    const [params, options] = stripe.checkout.sessions.create.mock.calls[0]!;
    expect(params.payment_intent_data).toMatchObject({ transfer_data: { destination: "acct_1" }, transfer_group: "bk-1" });
    expect(options).toEqual({});
  });

  it("registra il pagamento diretto con la trattenuta unica e stima il costo della carta, a nostro carico (§378)", async () => {
    const { service, prisma, stripe } = buildService();
    const job = { id: "jp-1", bookingId: "bk-1", paymentMethod: "MANOVIA", paidEurCents: 0, refundedEurCents: 0, stripeFeeEurCents: 0, applicationFeeEurCents: 0, stripePaymentIntentId: null, balancePaymentIntentId: null, balanceDirect: false, depositEurCents: 10000, releasedAt: null, booking: { finalAmountEurCents: null, professionalProfileId: "pro-1", quoteId: null } };
    prisma.jobPayment.findUnique.mockResolvedValue(job);
    stripe.paymentIntents.retrieve.mockResolvedValue({
      amount: 10000,
      latest_charge: { id: "ch_1", amount: 10000, application_fee_amount: 854, payment_method_details: { card: { country: "IT", regulated_status: "regulated" } }, balance_transaction: { fee: 854 } },
    });

    await service.recordCheckoutPayment("jp-1", "deposit", { payment_intent: "pi_dep", amount_total: 10000, metadata: { stripeAccount: "acct_1" } } as never, { notify: false });

    expect(stripe.paymentIntents.retrieve).toHaveBeenCalledWith("pi_dep", { expand: ["latest_charge.balance_transaction"] }, { stripeAccount: "acct_1" });
    // Carta europea: 1,5% + 0,25 € = 1,75 €, pagati da noi.
    expect(prisma.jobPayment.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ stripeDestinationAccountId: "acct_1", stripeDirectCharge: true, applicationFeeEurCents: 854, cardFeeEurCents: { increment: 175 } }) }),
    );
    expect(stripe.applicationFees.createRefund).not.toHaveBeenCalled();
    expect(prisma.platformFeeEntry.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { dedupeKey: "HOLD:pi_dep" }, create: expect.objectContaining({ grossEurCents: 854 }) }));
  });

  it("l'acconto non più confermabile si rimborsa sul conto del professionista con la trattenuta", async () => {
    const { service, stripe } = buildService();
    stripe.paymentIntents.retrieve.mockResolvedValue({ id: "pi_dep" });

    await service.refundQuoteDeposit("pi_dep", "Preventivo ritirato.", "acct_1");

    expect(stripe.paymentIntents.retrieve).toHaveBeenCalledWith("pi_dep", {}, { stripeAccount: "acct_1" });
    expect(stripe.refunds.create).toHaveBeenCalledWith(expect.objectContaining({ payment_intent: "pi_dep", refund_application_fee: true }), {
      idempotencyKey: "quote-deposit-refund-pi_dep",
      stripeAccount: "acct_1",
    });
  });
});

describe("rimborsi con l'addebito diretto", () => {
  it("prima dello sblocco rimborsa sul conto del professionista e gli restituisce la trattenuta", async () => {
    const { service, prisma, stripe } = buildService();
    const job = directJob({ onlineStage: "DEPOSIT_PAID", releasedAt: null, payoutPendingEurCents: 0, netAmountEurCents: 0 });
    prisma.jobPayment.findUnique.mockResolvedValue(job);
    prisma.jobPayment.findUniqueOrThrow.mockResolvedValueOnce(job).mockResolvedValueOnce(job).mockResolvedValue({ ...job, refundedEurCents: 10000 });
    prisma.jobPayment.update.mockResolvedValue({ ...job, refundedEurCents: 10000 });

    await expect(service.refundOnline("jp-1", "ALL", "Lavoro annullato.", "client-1")).resolves.toBe(10000);

    expect(stripe.refunds.create).toHaveBeenCalledWith(expect.not.objectContaining({ reverse_transfer: true }), expect.objectContaining({ stripeAccount: "acct_1" }));
    expect(stripe.applicationFees.createRefund).toHaveBeenCalledWith("fee_1", expect.objectContaining({ amount: 675 }), expect.anything());
    expect(stripe.transfers.createReversal).not.toHaveBeenCalled();
  });

  it("dopo lo sblocco Stripe lo prende dal suo saldo: niente debito, la nostra parte gli torna se non è colpa sua", async () => {
    const { service, prisma, stripe } = buildService();
    const job = directJob();
    prisma.jobPayment.findUnique.mockResolvedValue(job);
    prisma.jobPayment.findUniqueOrThrow.mockResolvedValue({ ...job, refundedEurCents: 10000 });
    prisma.jobPayment.update.mockResolvedValue({ ...job, refundedEurCents: 10000 });

    await service.refundOnline("jp-1", "ALL", "Annullato dal team.", null);

    expect(stripe.transfers.createReversal).not.toHaveBeenCalled();
    expect(prisma.jobPayment.update).toHaveBeenCalledWith({ where: { id: "jp-1" }, data: { netAmountEurCents: { decrement: 9325 }, payoutPendingEurCents: { decrement: 9325 } } });
    expect(stripe.refunds.create).toHaveBeenCalledWith(expect.objectContaining({ amount: 10000 }), expect.objectContaining({ stripeAccount: "acct_1" }));
    expect(stripe.applicationFees.createRefund).toHaveBeenCalledWith("fee_1", expect.objectContaining({ amount: 675 }), expect.anything());
    expect(prisma.jobPayment.update).not.toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ professionalDebtEurCents: expect.anything() }) }));
  });

  it("dopo lo sblocco per colpa sua la nostra parte resta a suo carico, senza debito", async () => {
    const { service, prisma, stripe } = buildService();
    const job = directJob();
    prisma.jobPayment.findUnique.mockResolvedValue(job);
    prisma.jobPayment.findUniqueOrThrow.mockResolvedValue({ ...job, refundedEurCents: 10000 });
    prisma.jobPayment.update.mockResolvedValue({ ...job, refundedEurCents: 10000 });

    await service.refundOnline("jp-1", "ALL", "Segnalazione accolta.", null, { professionalFault: true });

    expect(stripe.applicationFees.createRefund).not.toHaveBeenCalled();
    expect(prisma.jobPayment.update).not.toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ professionalDebtEurCents: expect.anything() }) }));
  });
});

describe("sblocco con l'addebito diretto", () => {
  it("riprende il debito con un prelievo dal suo conto, maggiorato del costo Stripe; i costi Connect sono nostri", async () => {
    const { service, prisma, stripe } = buildService();
    const job = toRelease({ applicationFeeEurCents: 854, stripeFeeEurCents: 0, platformFeeEurCents: 854 });
    prisma.jobPayment.findUnique.mockResolvedValueOnce(job).mockResolvedValue(null);
    prisma.jobPayment.findUniqueOrThrow.mockResolvedValue(job);
    prisma.jobPayment.count.mockResolvedValue(0);
    prisma.jobPayment.findMany.mockImplementation(async (args: { where: Record<string, unknown> }) =>
      "professionalDebtEurCents" in args.where ? [{ id: "jp-old", professionalDebtEurCents: 1000 }] : [],
    );

    await expect(service.releaseIfDue("jp-1", new Date("2026-10-15T10:00:00Z"))).resolves.toBe(true);

    // 10 € di debito, prelevati con l'1,4% in più. Bonifico e quota mensile Connect li paghiamo noi.
    expect(stripe.charges.create).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 1015, currency: "eur", source: "acct_1" }),
      { idempotencyKey: "job-debit-jp-1-release-1000" },
    );
    expect(stripe.transfers.createReversal).not.toHaveBeenCalled();
    expect(prisma.jobPayment.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ payoutPendingEurCents: 9146 - 1000, platformFeeEurCents: 854 }) }),
    );
  });

  it("non sblocca più di quanto resta sul conto se Stripe ha già preso soldi per un altro lavoro", async () => {
    const { service, prisma, stripe } = buildService();
    const job = toRelease({ applicationFeeEurCents: 854, stripeFeeEurCents: 0, platformFeeEurCents: 854 });
    prisma.jobPayment.findUnique.mockResolvedValueOnce(job).mockResolvedValue(null);
    prisma.jobPayment.findUniqueOrThrow.mockResolvedValue(job);
    // Sul conto solo 50 € invece di 91,46 €: un rimborso di un lavoro già pagato li ha presi.
    stripe.balance.retrieve.mockResolvedValue({ available: [{ amount: 5000, currency: "eur" }], pending: [] });

    await expect(service.releaseIfDue("jp-1")).resolves.toBe(true);

    // Bonifico da 50 €, senza prelievi: il suo costo è nostro.
    expect(stripe.charges.create).not.toHaveBeenCalled();
    expect(prisma.jobPayment.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ onlineStage: "RELEASED", payoutPendingEurCents: 5000, platformFeeEurCents: 854 }) }),
    );
  });
});

describe("contestazioni in banca con l'addebito diretto", () => {
  function dispute(overrides: Record<string, unknown> = {}) {
    return { id: "dp_1", payment_intent: "pi_dep", amount: 10000, status: "needs_response", reason: "product_unacceptable", balance_transactions: [], ...overrides } as never;
  }

  it("all'apertura Stripe prende la cifra dal suo saldo: nessuno storno, si segna solo quanto è uscito", async () => {
    const { service, prisma, stripe } = buildService();
    const job = directJob({ onlineStage: "PAID", releasedAt: null, payoutPendingEurCents: 0, stripeDisputeId: "dp_1", stripeDisputeStatus: "needs_response" });
    prisma.jobPayment.findFirst.mockResolvedValue(job);

    await service.handleStripeDisputeFunds(dispute(), "withdrawn");

    expect(stripe.transfers.createReversal).not.toHaveBeenCalled();
    expect(stripe.charges.create).not.toHaveBeenCalled();
    expect(prisma.jobPayment.update).toHaveBeenCalledWith({ where: { id: "jp-1" }, data: { disputeRecoveredEurCents: 9325 } });
  });

  it("vinta dopo il bonifico: la cifra rimessa da Stripe torna tutta nel bonifico", async () => {
    const { service, prisma, stripe } = buildService();
    const job = directJob({ payoutPendingEurCents: 0, payoutSentEurCents: 9325, stripeDisputeId: "dp_1", stripeDisputeStatus: "under_review" });
    prisma.jobPayment.findFirst.mockResolvedValue(job);
    prisma.jobPayment.findUnique.mockResolvedValue(null);

    await service.handleStripeDisputeFunds(dispute({ status: "won" }), "reinstated");

    expect(stripe.transfers.create).not.toHaveBeenCalled();
    expect(prisma.jobPayment.updateMany).toHaveBeenCalledWith({
      where: { id: "jp-1", disputeReturnTransferId: null },
      data: { disputeRecoveredEurCents: 0, disputeReturnTransferId: "reinstated-dp_1", payoutPendingEurCents: { increment: 10000 } },
    });
  });

  it("persa per frode dopo il bonifico: la nostra parte gli torna, nessun debito", async () => {
    const { service, prisma, stripe } = buildService();
    const job = directJob({ payoutPendingEurCents: 0, payoutSentEurCents: 9325, stripeDisputeId: "dp_1", stripeDisputeStatus: "under_review" });
    prisma.jobPayment.findFirst.mockResolvedValue(job);
    prisma.jobPayment.findUniqueOrThrow.mockResolvedValue(job);
    prisma.jobPayment.update.mockResolvedValue(job);

    await service.handleStripeDispute(dispute({ status: "lost", reason: "fraudulent" }));

    expect(stripe.applicationFees.createRefund).toHaveBeenCalledWith("fee_1", expect.objectContaining({ amount: 675 }), expect.anything());
    expect(prisma.jobPayment.update).not.toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ professionalDebtEurCents: expect.anything() }) }));
  });

  it("persa per lavoro non conforme dopo il bonifico: solo la commissione di Stripe, con l'IVA, diventa un suo debito", async () => {
    const { service, prisma, stripe } = buildService();
    const job = directJob({ payoutPendingEurCents: 0, payoutSentEurCents: 9325, stripeDisputeId: "dp_1", stripeDisputeStatus: "under_review" });
    prisma.jobPayment.findFirst.mockResolvedValue(job);
    prisma.jobPayment.update.mockResolvedValue({ ...job, professionalDebtEurCents: 2440 });

    await service.handleStripeDispute(dispute({ status: "lost" }));

    expect(stripe.applicationFees.createRefund).not.toHaveBeenCalled();
    // 20 € + 4,40 € di IVA: un costo ribaddebitato, nella fattura del mese (§378).
    expect(prisma.jobPayment.update).toHaveBeenCalledWith(expect.objectContaining({ data: { professionalDebtEurCents: { increment: 2440 } } }));
    expect(prisma.platformFeeEntry.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { dedupeKey: "COSTS:dp_1" }, create: expect.objectContaining({ kind: "COSTS", grossEurCents: 2440 }) }));
  });
});

describe("rimborso in attesa di fondi sul conto del professionista (§269)", () => {
  it("se il suo saldo non basta avvisa cliente e professionista e segna il rimborso", async () => {
    const { service, prisma, stripe } = buildService();
    const job = { ...directJob(), booking: { id: "bk-1", clientId: "client-1", professionalProfile: { userId: "pro-user-1" }, quote: { guidedRequestId: "gr-1" } } };
    prisma.jobPayment.findUnique.mockResolvedValue(job);
    prisma.jobPayment.findUniqueOrThrow.mockResolvedValue({ ...job, refundedEurCents: 10000 });
    prisma.jobPayment.update.mockResolvedValue({ ...job, refundedEurCents: 10000 });
    stripe.refunds.create.mockResolvedValue({ id: "re_wait", amount: 10000, status: "pending" });
    const notify = (service as unknown as { notificationsService: { notify: ReturnType<typeof vi.fn> } }).notificationsService.notify;

    await service.refundOnline("jp-1", "ALL", "Annullato dal team.", null);

    expect(stripe.refunds.update).toHaveBeenCalledWith(
      "re_wait",
      { metadata: { waitingFunds: "true", clientUserId: "client-1", guidedRequestId: "gr-1", bookingId: "bk-1" } },
      { stripeAccount: "acct_1" },
    );
    expect(notify).toHaveBeenCalledWith("client-1", "JOB_REFUND_PENDING", expect.objectContaining({ amountEurCents: 10000, audience: "CLIENT" }));
    expect(notify).toHaveBeenCalledWith("pro-user-1", "JOB_REFUND_WAITING_FUNDS", expect.objectContaining({ amountEurCents: 10000 }));
    expect(prisma.jobPayment.update).toHaveBeenCalledWith({ where: { id: "jp-1" }, data: { refundWaitingEurCents: { increment: 10000 } } });
  });

  it("un rimborso riuscito subito non avvisa di nulla in più", async () => {
    const { service, prisma, stripe } = buildService();
    const job = directJob();
    prisma.jobPayment.findUnique.mockResolvedValue(job);
    prisma.jobPayment.findUniqueOrThrow.mockResolvedValue({ ...job, refundedEurCents: 10000 });
    prisma.jobPayment.update.mockResolvedValue({ ...job, refundedEurCents: 10000 });

    await service.refundOnline("jp-1", "ALL", "Annullato dal team.", null);

    expect(stripe.refunds.update).not.toHaveBeenCalled();
  });

  it("l'acconto rimborsato in attesa lo segnala a chi lo ha pagato", async () => {
    const { service, stripe } = buildService();
    stripe.paymentIntents.retrieve.mockResolvedValue({ id: "pi_dep" });
    stripe.refunds.create.mockResolvedValue({ id: "re_dep", amount: 3600, status: "pending" });

    await expect(service.refundQuoteDeposit("pi_dep", "Preventivo ritirato.", "acct_1", { clientUserId: "client-1", guidedRequestId: "gr-1" })).resolves.toEqual({ pending: true });

    expect(stripe.refunds.update).toHaveBeenCalledWith("re_dep", { metadata: { waitingFunds: "true", clientUserId: "client-1", guidedRequestId: "gr-1" } }, { stripeAccount: "acct_1" });
  });

  it("all'arrivo avvisa il cliente una volta sola", async () => {
    const { service, stripe } = buildService();
    const notify = (service as unknown as { notificationsService: { notify: ReturnType<typeof vi.fn> } }).notificationsService.notify;
    const refund = { id: "re_wait", amount: 10000, status: "succeeded", metadata: { waitingFunds: "true", clientUserId: "client-1", guidedRequestId: "gr-1", bookingId: "bk-1" } };

    await service.handleRefundUpdated(refund as never, "acct_1");
    await service.handleRefundUpdated({ ...refund, metadata: { ...refund.metadata, waitingFunds: "done" } } as never, "acct_1");
    await service.handleRefundUpdated({ ...refund, status: "pending" } as never, "acct_1");

    expect(stripe.refunds.update).toHaveBeenCalledWith("re_wait", { metadata: { waitingFunds: "done" } }, { stripeAccount: "acct_1" });
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith("client-1", "JOB_REFUND_COMPLETED", { bookingId: "bk-1", guidedRequestId: "gr-1", amountEurCents: 10000, audience: "CLIENT" });
  });

  it("all'arrivo toglie il rimborso da quelli in attesa del lavoro", async () => {
    const { service, prisma } = buildService();
    prisma.jobPayment.findUnique.mockResolvedValue({ refundWaitingEurCents: 10000 });

    await service.handleRefundUpdated(
      { id: "re_wait", amount: 6000, status: "succeeded", metadata: { waitingFunds: "true", jobPaymentId: "jp-1", clientUserId: "client-1" } } as never,
      "acct_1",
    );

    expect(prisma.jobPayment.update).toHaveBeenCalledWith({ where: { id: "jp-1" }, data: { refundWaitingEurCents: 4000 } });
  });

  it("se non riesce avvisa il team Finanza", async () => {
    const { service, prisma } = buildService();
    prisma.user.findMany.mockResolvedValue([{ id: "admin-1", adminRoles: ["FINANCE"] }]);
    const notify = (service as unknown as { notificationsService: { notify: ReturnType<typeof vi.fn> } }).notificationsService.notify;

    await service.handleRefundUpdated({ id: "re_wait", amount: 10000, status: "failed", metadata: { waitingFunds: "true", clientUserId: "client-1" } } as never, "acct_1");

    expect(notify).toHaveBeenCalledWith("admin-1", "ADMIN_JOB_REFUND_FAILED", expect.objectContaining({ amountEurCents: 10000 }));
    expect(notify).not.toHaveBeenCalledWith("client-1", expect.anything(), expect.anything());
  });
});
