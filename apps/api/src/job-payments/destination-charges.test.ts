import { describe, expect, it, vi } from "vitest";
import { onlineApplicationFeeHoldEurCents, professionalPayoutTotals, type JobPaymentSummary } from "@professionisti/shared";
import { OnlineMoneyService } from "./online-money.service";

/**
 * Soldi bloccati sul conto Stripe del professionista (docs/CHANGELOG.md
 * §249): addebito a destinazione con trattenuta, bonifici manuali sbloccati
 * dal sito, rimborsi ripresi dal suo conto. Ogni chiamata a Stripe è finta e
 * controllata, perché un errore qui vuol dire soldi non bloccati, bonifici
 * doppi o un conto del professionista in negativo.
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
      count: vi.fn().mockResolvedValue(0),
    },
    refund: { count: vi.fn().mockResolvedValue(0) },
    professionalFiscalProfile: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    booking: { findUnique: vi.fn(), findFirst: vi.fn().mockResolvedValue({ professionalProfileId: "pro-1" }) },
    manoviaRevenue: { create: vi.fn() },
    platformFeeEntry: { upsert: vi.fn() },
    professionalProfile: { findUnique: vi.fn() },
    quote: { findUnique: vi.fn() },
    user: { findMany: vi.fn().mockResolvedValue([]) },
  };
  const auditLogService = { record: vi.fn() };
  const notificationsService = { notify: vi.fn() };
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
    balance: { retrieve: vi.fn() },
    payouts: { create: vi.fn().mockResolvedValue({ id: "po_1" }) },
    transfers: { create: vi.fn(), createReversal: vi.fn(), retrieve: vi.fn() },
    applicationFees: { createRefund: vi.fn() },
    refunds: { create: vi.fn() },
    paymentIntents: { retrieve: vi.fn(), create: vi.fn() },
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
    disputeRecoveredEurCents: 0,
    disputeReturnTransferId: null,
    professionalDebtEurCents: 0,
    platformFeeEurCents: 500,
    stripeFeeEurCents: 175,
    booking: { id: "bk-1", professionalProfile: { userId: "pro-user-1" }, quote: { guidedRequestId: "gr-1" } },
    ...overrides,
  };
}

describe("trattenuta sul pagamento", () => {
  it("è la trattenuta unica del 7% più l'IVA, già definitiva (§377)", () => {
    // 7% di 100 € = 7 €, più il 22% di IVA = 8,54 €. Carta e bonifici sono nostri.
    expect(onlineApplicationFeeHoldEurCents(10000)).toBe(854);
    expect(onlineApplicationFeeHoldEurCents(10)).toBe(1);
    expect(onlineApplicationFeeHoldEurCents(0)).toBe(0);
  });
});

describe("OnlineMoneyService.createQuoteDepositCheckout", () => {
  it("addebita direttamente sul conto del professionista e mette in manuale i suoi bonifici prima del primo pagamento (§268)", async () => {
    const { service, prisma, stripe } = buildService();
    prisma.professionalFiscalProfile.findUnique.mockResolvedValue({ id: "fp-1", stripeConnectAccountId: "acct_1", stripePayoutsEnabled: true, stripeManualPayoutsAt: null, stripeNegativeDebitAt: null });

    await service.createQuoteDepositCheckout({ clientUserId: "c-1", quoteId: "q-1", guidedRequestId: "gr-1", paymentMethod: "ONLINE", amountEurCents: 10000, businessName: "Rossi Impianti", professionalProfileId: "pro-1" });

    expect(stripe.balanceSettings.update).toHaveBeenCalledWith(
      { payments: { payouts: { schedule: { interval: "manual" } }, debit_negative_balances: true } },
      { stripeAccount: "acct_1" },
    );
    const [params, options] = stripe.checkout.sessions.create.mock.calls[0]!;
    expect(options).toEqual({ stripeAccount: "acct_1" });
    expect(params.payment_intent_data).toMatchObject({ application_fee_amount: 854, metadata: { stripeAccount: "acct_1" } });
    expect(params.payment_intent_data.transfer_data).toBeUndefined();
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
  it("registra il conto del professionista, la trattenuta nell'estratto e il costo della carta a nostro carico", async () => {
    const { service, prisma, stripe } = buildService();
    const job = { id: "jp-1", bookingId: "bk-1", paymentMethod: "MANOVIA", paidEurCents: 0, refundedEurCents: 0, stripeFeeEurCents: 0, applicationFeeEurCents: 0, stripePaymentIntentId: null, balancePaymentIntentId: null, balanceDirect: false, depositEurCents: 10000, releasedAt: null, booking: { finalAmountEurCents: null, professionalProfileId: "pro-1", quoteId: null } };
    prisma.jobPayment.findUnique.mockResolvedValue(job);
    stripe.paymentIntents.retrieve.mockResolvedValue({ transfer_data: { destination: "acct_1" }, latest_charge: { id: "ch_1", application_fee_amount: 854, balance_transaction: { fee: 175 } } });

    await service.recordCheckoutPayment("jp-1", "deposit", { payment_intent: "pi_dep", amount_total: 10000 } as never, { notify: false });

    expect(prisma.jobPayment.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ stripeDestinationAccountId: "acct_1", applicationFeeEurCents: 854, cardFeeEurCents: { increment: 175 } }) }),
    );
    // La trattenuta è già quella definitiva: niente conguaglio.
    expect(stripe.applicationFees.createRefund).not.toHaveBeenCalled();
    expect(prisma.platformFeeEntry.upsert).toHaveBeenCalledWith({
      where: { dedupeKey: "HOLD:pi_dep" },
      create: expect.objectContaining({ professionalProfileId: "pro-1", jobPaymentId: "jp-1", kind: "HOLD", grossEurCents: 854, taxableEurCents: 700, vatEurCents: 154 }),
      update: {},
    });
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
    prisma.jobPayment.findMany.mockResolvedValue([{ releasedAt: null, paidEurCents: 8000, refundedEurCents: 0, applicationFeeEurCents: 540, payoutPendingEurCents: 0, disputeRecoveredEurCents: 0 }]);

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
      ...releasedJob({ onlineStage: "PAID", releasedAt: null, payoutPendingEurCents: 0, netAmountEurCents: 0, applicationFeeEurCents: 854, stripeFeeEurCents: 0, platformFeeEurCents: 683, releaseDueAt: null }),
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
    const afterRefund = { ...job, refundedEurCents: 2000, applicationFeeEurCents: 854 };
    prisma.jobPayment.findUniqueOrThrow.mockResolvedValue(afterRefund);
    prisma.jobPayment.update.mockResolvedValue(afterRefund);
    stripe.paymentIntents.retrieve.mockImplementation(async (_pi: string, opts: { expand: string[] }) =>
      opts.expand[0] === "latest_charge.application_fee"
        ? { latest_charge: { application_fee: { id: "fee_1", amount: 854, amount_refunded: 0 } } }
        : opts.expand[0] === "latest_charge.transfer"
          ? { latest_charge: { transfer: { id: "tr_1", amount: 10000, amount_reversed: 2000 } } }
          : { transfer_data: { destination: "acct_1" }, latest_charge: { amount: 10000, amount_refunded: 0 } },
    );

    await expect(service.releaseIfDue("jp-1")).resolves.toBe(true);

    expect(stripe.transfers.create).not.toHaveBeenCalled();
    // La differenza torna al cliente, ripresa dal conto del professionista.
    expect(stripe.refunds.create).toHaveBeenCalledWith(expect.objectContaining({ payment_intent: "pi_dep", amount: 2000, reverse_transfer: true }), expect.anything());
    // Restano 80 €: dovuti 6,83 € (7% + IVA), trattenuti 8,54 €: tornano 1,71 €. Il bonifico è a nostro carico.
    expect(stripe.applicationFees.createRefund).toHaveBeenCalledWith("fee_1", expect.objectContaining({ amount: 171 }), expect.anything());
    expect(stripe.transfers.createReversal).not.toHaveBeenCalled();
    expect(prisma.jobPayment.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ onlineStage: "RELEASED", payoutPendingEurCents: 8000 - 683, platformFeeEurCents: 683 }) }),
    );
    expect(prisma.platformFeeEntry.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { dedupeKey: "RETURN:fee_1-0-171" }, create: expect.objectContaining({ kind: "RETURN", grossEurCents: -171, taxableEurCents: -140, vatEurCents: -31 }) }),
    );
    // Ricavo IVA esclusa: 6,83 € con l'IVA sono 5,60 €.
    expect(prisma.manoviaRevenue.create).toHaveBeenCalledWith({ data: expect.objectContaining({ amountEurCents: 560 }) });
  });

  it("prima del bonifico riprende il debito di un lavoro precedente, senza costi Connect (§377)", async () => {
    const { service, prisma, stripe, notificationsService } = buildService();
    const job = {
      ...releasedJob({ onlineStage: "PAID", releasedAt: null, payoutPendingEurCents: 0, netAmountEurCents: 0, applicationFeeEurCents: 854, stripeFeeEurCents: 0, platformFeeEurCents: 854, releaseDueAt: null }),
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
    prisma.jobPayment.findUnique.mockResolvedValueOnce(job).mockResolvedValue(releasedJob({ payoutPendingEurCents: 0 }));
    prisma.jobPayment.findUniqueOrThrow.mockResolvedValue(job);
    // Debito di 10 € rimasto da un rimborso dopo il bonifico.
    prisma.jobPayment.findMany.mockResolvedValue([{ id: "jp-old", professionalDebtEurCents: 1000 }]);
    stripe.paymentIntents.retrieve.mockImplementation(async (_pi: string, opts: { expand: string[] }) =>
      opts.expand[0] === "latest_charge.transfer"
        ? { latest_charge: { transfer: { id: "tr_1", amount: 10000, amount_reversed: 0 } } }
        : { latest_charge: { application_fee: { id: "fee_1", amount: 854, amount_refunded: 0 } } },
    );

    await expect(service.releaseIfDue("jp-1", new Date("2026-10-15T10:00:00Z"))).resolves.toBe(true);

    // Sul conto 91,46 €: si stornano solo i 10 € di debito, il bonifico da 81,46 € è a nostro carico.
    expect(stripe.applicationFees.createRefund).not.toHaveBeenCalled();
    expect(stripe.transfers.createReversal).toHaveBeenCalledWith("tr_1", expect.objectContaining({ amount: 1000 }), expect.anything());
    expect(prisma.jobPayment.updateMany).toHaveBeenCalledWith({ where: { id: "jp-old", professionalDebtEurCents: { gte: 1000 } }, data: { professionalDebtEurCents: { decrement: 1000 } } });
    expect(prisma.jobPayment.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ payoutPendingEurCents: 9146 - 1000, platformFeeEurCents: 854 }) }),
    );
    expect(notificationsService.notify).toHaveBeenCalledWith("pro-user-1", "JOB_PAYOUT_SENT", expect.objectContaining({ debtRecoveredEurCents: 1000 }));
  });

  it("dopo una segnalazione accolta con rimborso parziale sblocca il resto", async () => {
    const { service, prisma } = buildService();
    const job = {
      ...releasedJob({ onlineStage: "PAID", releasedAt: null, refundedEurCents: 5000, releaseDueAt: null }),
      booking: {
        id: "bk-1",
        clientId: "client-1",
        finalAmountEurCents: 10000,
        professionalCompletedAt: new Date("2026-10-01T10:00:00Z"),
        clientConfirmedCompletedAt: new Date("2026-10-01T12:00:00Z"),
        issue: { status: "UPHELD", appealedAt: null, appealDecision: null, refundPercent: 100 },
        professionalProfile: { id: "pro-1", userId: "pro-user-1", fiscalProfile: { stripeConnectAccountId: "acct_1", stripePayoutsEnabled: true } },
        quote: { guidedRequestId: "gr-1" },
      },
    };
    prisma.jobPayment.findUnique.mockResolvedValue(job);
    // Rimborso totale: resta bloccato.
    await expect(service.releaseIfDue("jp-1")).resolves.toBe(false);
    // Rimborso del 50% ancora da eseguire dalla Finanza: resta bloccato.
    prisma.jobPayment.findUnique.mockResolvedValue({ ...job, booking: { ...job.booking, issue: { ...job.booking.issue, refundPercent: 50 } } });
    prisma.refund.count.mockResolvedValueOnce(1);
    await expect(service.releaseIfDue("jp-1")).resolves.toBe(false);
    expect(prisma.jobPayment.updateMany).not.toHaveBeenCalled();
    // Rimborso del 50% eseguito: si sblocca.
    prisma.jobPayment.updateMany.mockResolvedValue({ count: 0 });
    await service.releaseIfDue("jp-1");
    expect(prisma.jobPayment.updateMany).toHaveBeenCalledWith({ where: { id: "jp-1", releasedAt: null }, data: { releasedAt: expect.any(Date) } });
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

describe("OnlineMoneyService.refundOnline per colpa del professionista (§267)", () => {
  it("dopo il bonifico riprende quanto c'è ancora e mette il resto come debito, compresa la nostra commissione", async () => {
    const { service, prisma, stripe, notificationsService } = buildService();
    // Sbloccati 93,25 €, bonifico già partito per 90 €: sul conto ne restano 3,25 €.
    const job = releasedJob({ payoutPendingEurCents: 325, payoutSentEurCents: 9000 });
    prisma.jobPayment.findUnique.mockResolvedValue(job);
    prisma.jobPayment.findUniqueOrThrow.mockResolvedValue({ ...job, refundedEurCents: 10000 });
    prisma.jobPayment.update.mockResolvedValue({ ...job, professionalDebtEurCents: 9500 });
    stripe.paymentIntents.retrieve.mockImplementation(async (_pi: string, opts: { expand: string[] }) =>
      opts.expand[0] === "latest_charge.transfer"
        ? { latest_charge: { transfer: { id: "tr_1", amount: 10000, amount_reversed: 0 } } }
        : { transfer_data: { destination: "acct_1" }, latest_charge: { amount: 10000, amount_refunded: 0 } },
    );

    await service.refundOnline("jp-1", "ALL", "Segnalazione accolta.", null, { professionalFault: true });

    expect(stripe.transfers.createReversal).toHaveBeenCalledWith("tr_1", expect.objectContaining({ amount: 325 }), expect.anything());
    // Il cliente riceve tutto dal nostro conto (niente reverse_transfer dopo lo sblocco).
    expect(stripe.refunds.create).toHaveBeenCalledWith(expect.not.objectContaining({ reverse_transfer: true }), expect.anything());
    // Debito: 90 € già in banca + 6,75 € di trattenuta (commissione e carta restano a noi).
    expect(prisma.jobPayment.update).toHaveBeenCalledWith(expect.objectContaining({ data: { professionalDebtEurCents: { increment: 9000 + 675 } } }));
    expect(notificationsService.notify).toHaveBeenCalledWith("pro-user-1", "JOB_PAYMENT_DEBT", expect.objectContaining({ amountEurCents: 9675 }));
  });

  it("con il rimborso totale prima dello sblocco la trattenuta diventa un suo debito, in fattura come costo", async () => {
    const { service, prisma, stripe } = buildService();
    const job = releasedJob({ onlineStage: "PAID", releasedAt: null, payoutPendingEurCents: 0, netAmountEurCents: 0, applicationFeeEurCents: 854, stripeFeeEurCents: 0 });
    prisma.jobPayment.findUnique.mockResolvedValue(job);
    prisma.jobPayment.findUniqueOrThrow.mockResolvedValue({ ...job, refundedEurCents: 10000 });
    prisma.jobPayment.update.mockResolvedValue({ ...job, refundedEurCents: 10000, applicationFeeEurCents: 0 });
    stripe.paymentIntents.retrieve.mockResolvedValue({ transfer_data: { destination: "acct_1" }, latest_charge: { amount: 10000, amount_refunded: 0, application_fee: null } });

    await service.refundOnline("jp-1", "ALL", "Segnalazione accolta.", null, { professionalFault: true });

    expect(prisma.jobPayment.update).toHaveBeenCalledWith(expect.objectContaining({ data: { professionalDebtEurCents: { increment: 854 } } }));
    expect(prisma.platformFeeEntry.upsert).toHaveBeenCalledWith(expect.objectContaining({ create: expect.objectContaining({ kind: "COSTS", grossEurCents: 854 }) }));
  });

  it("senza colpa (annullamento) nessun debito per il costo della carta", async () => {
    const { service, prisma, stripe } = buildService();
    const job = releasedJob({ onlineStage: "DEPOSIT_PAID", releasedAt: null, payoutPendingEurCents: 0, netAmountEurCents: 0 });
    prisma.jobPayment.findUnique.mockResolvedValue(job);
    prisma.jobPayment.findUniqueOrThrow.mockResolvedValue({ ...job, refundedEurCents: 10000 });
    prisma.jobPayment.update.mockResolvedValue({ ...job, refundedEurCents: 10000, applicationFeeEurCents: 0 });
    stripe.paymentIntents.retrieve.mockResolvedValue({ transfer_data: { destination: "acct_1" }, latest_charge: { amount: 10000, amount_refunded: 0, application_fee: null } });

    await service.refundOnline("jp-1", "ALL", "Lavoro annullato.", "client-1");

    expect(prisma.jobPayment.update).not.toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ professionalDebtEurCents: expect.anything() }) }));
  });
});

describe("OnlineMoneyService.handleStripeDisputeFunds (§267)", () => {
  function dispute(overrides: Record<string, unknown> = {}) {
    return { id: "dp_1", payment_intent: "pi_dep", amount: 10000, status: "needs_response", reason: "product_unacceptable", balance_transactions: [], ...overrides } as never;
  }

  it("alla contestazione riprende subito la cifra dai soldi ancora bloccati del professionista", async () => {
    const { service, prisma, stripe } = buildService();
    const job = releasedJob({ onlineStage: "PAID", releasedAt: null, payoutPendingEurCents: 0, stripeDisputeId: "dp_1", stripeDisputeStatus: "needs_response" });
    prisma.jobPayment.findFirst.mockResolvedValue(job);
    prisma.jobPayment.findUniqueOrThrow.mockResolvedValue(job);
    stripe.paymentIntents.retrieve.mockResolvedValue({ latest_charge: { transfer: { id: "tr_1", amount: 10000, amount_reversed: 0 } } });

    await expect(service.handleStripeDisputeFunds(dispute(), "withdrawn")).resolves.toBe(true);

    // Sul conto ci sono 100 € meno 6,75 € di trattenuta: si riprendono 93,25 €.
    expect(stripe.transfers.createReversal).toHaveBeenCalledWith("tr_1", expect.objectContaining({ amount: 9325 }), expect.anything());
    expect(prisma.jobPayment.update).toHaveBeenCalledWith({ where: { id: "jp-1" }, data: { disputeRecoveredEurCents: 9325 } });
  });

  it("se la contestazione è vinta la cifra torna al professionista", async () => {
    const { service, prisma, stripe } = buildService();
    const job = releasedJob({ onlineStage: "PAID", releasedAt: null, payoutPendingEurCents: 0, stripeDisputeId: "dp_1", stripeDisputeStatus: "under_review", disputeRecoveredEurCents: 9325 });
    prisma.jobPayment.findFirst.mockResolvedValue(job);
    prisma.jobPayment.findUnique.mockResolvedValue(null);
    stripe.transfers.create.mockResolvedValue({ id: "tr_back" });

    await service.handleStripeDisputeFunds(dispute({ status: "won" }), "reinstated");

    expect(stripe.transfers.create).toHaveBeenCalledWith(expect.objectContaining({ amount: 9325, destination: "acct_1" }), { idempotencyKey: "job-dispute-return-dp_1" });
    expect(prisma.jobPayment.update).toHaveBeenCalledWith({ where: { id: "jp-1" }, data: { disputeRecoveredEurCents: 0, disputeReturnTransferId: "tr_back" } });
  });

  it("persa dopo il bonifico: la parte del professionista e la commissione di Stripe con l'IVA diventano un suo debito", async () => {
    const { service, prisma } = buildService();
    const job = releasedJob({ payoutPendingEurCents: 0, payoutSentEurCents: 9325, stripeDisputeId: "dp_1", stripeDisputeStatus: "under_review" });
    prisma.jobPayment.findFirst.mockResolvedValue(job);
    prisma.jobPayment.update.mockResolvedValue({ ...job, professionalDebtEurCents: 11500 });

    await service.handleStripeDispute(dispute({ status: "lost", balance_transactions: [{ fee: 2000 }] }));

    // 93,25 € già in banca + 6,75 € di trattenuta + 20 € di commissione di Stripe con l'IVA (24,40 €).
    expect(prisma.jobPayment.update).toHaveBeenCalledWith(expect.objectContaining({ data: { professionalDebtEurCents: { increment: 9325 + 675 + 2440 } } }));
    expect(prisma.platformFeeEntry.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { dedupeKey: "COSTS:dp_1" }, create: expect.objectContaining({ kind: "COSTS", grossEurCents: 2440, taxableEurCents: 2000, vatEurCents: 440 }) }),
    );
  });

  it("persa per frode: la commissione di Stripe resta a noi", async () => {
    const { service, prisma } = buildService();
    const job = releasedJob({ payoutPendingEurCents: 0, payoutSentEurCents: 9325, stripeDisputeId: "dp_1", stripeDisputeStatus: "under_review" });
    prisma.jobPayment.findFirst.mockResolvedValue(job);
    prisma.jobPayment.update.mockResolvedValue(job);

    await service.handleStripeDispute(dispute({ status: "lost", reason: "fraudulent", balance_transactions: [{ fee: 2000 }] }));

    expect(prisma.jobPayment.update).toHaveBeenCalledWith(expect.objectContaining({ data: { professionalDebtEurCents: { increment: 9325 } } }));
  });
});

describe("saldo addebitato sulla carta dell'acconto (§267)", () => {
  it("salva la carta all'acconto solo se anche il saldo si paga online", async () => {
    const { service, prisma, stripe } = buildService();
    prisma.professionalFiscalProfile.findUnique.mockResolvedValue({ id: "fp-1", stripeConnectAccountId: "acct_1", stripePayoutsEnabled: true, stripeManualPayoutsAt: new Date(), stripeNegativeDebitAt: new Date() });
    const params = { clientUserId: "c-1", quoteId: "q-1", guidedRequestId: "gr-1", amountEurCents: 10000, businessName: "Rossi", professionalProfileId: "pro-1" };

    await service.createQuoteDepositCheckout({ ...params, paymentMethod: "ONLINE" });
    await service.createQuoteDepositCheckout({ ...params, paymentMethod: "MIXED" });

    const [online, mixed] = stripe.checkout.sessions.create.mock.calls.map((call) => call[0]);
    expect(online).toMatchObject({ customer_creation: "always", payment_intent_data: { setup_future_usage: "off_session" } });
    expect(mixed.customer_creation).toBeUndefined();
    expect(mixed.payment_intent_data.setup_future_usage).toBeUndefined();
  });

  function closedJob(overrides: Record<string, unknown> = {}) {
    return {
      ...releasedJob({ onlineStage: "DEPOSIT_PAID", releasedAt: null, paidEurCents: 2000, applicationFeeEurCents: 165, payoutPendingEurCents: 0, netAmountEurCents: 0 }),
      clientStripeCustomerId: "cus_1",
      savedPaymentMethodId: "pm_1",
      balanceDirect: false,
      balanceAutoChargedAt: null,
      booking: { clientId: "client-1", finalAmountEurCents: 10000, professionalProfileId: "pro-1", quoteId: null, professionalProfile: { businessName: "Rossi Impianti" }, quote: { guidedRequestId: "gr-1" } },
      ...overrides,
    };
  }

  it("alla chiusura addebita il saldo sulla carta salvata, sul conto del professionista", async () => {
    const { service, prisma, stripe, notificationsService } = buildService();
    prisma.jobPayment.findUniqueOrThrow.mockResolvedValue(closedJob());
    prisma.jobPayment.findUnique.mockResolvedValue(closedJob());
    stripe.paymentIntents.create = vi.fn().mockResolvedValue({ id: "pi_bal", status: "succeeded", amount: 8000 });
    stripe.paymentIntents.retrieve.mockResolvedValue({ transfer_data: { destination: "acct_1" }, latest_charge: { id: "ch_2", application_fee_amount: 0, balance_transaction: { fee: 0 } } });

    await expect(service.afterCompletion("jp-1", 10000, 500, { autoCharge: true })).resolves.toEqual({ balanceDueEurCents: 0, autoChargedEurCents: 8000 });

    expect(stripe.paymentIntents.create).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 8000, customer: "cus_1", payment_method: "pm_1", off_session: true, confirm: true, transfer_data: { destination: "acct_1" } }),
      { idempotencyKey: "job-auto-balance-jp-1-2000-8000" },
    );
    expect(prisma.jobPayment.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ balancePaymentIntentId: "pi_bal", paidEurCents: 10000 }) }));
    expect(notificationsService.notify).toHaveBeenCalledWith("client-1", "JOB_BALANCE_AUTO_CHARGED", expect.objectContaining({ amountEurCents: 8000 }));
  });

  it("se la banca rifiuta, il cliente paga con il link come prima", async () => {
    const { service, prisma, stripe } = buildService();
    prisma.jobPayment.findUniqueOrThrow.mockResolvedValue(closedJob());
    stripe.paymentIntents.create = vi.fn().mockRejectedValue(Object.assign(new Error("Your card was declined."), { code: "card_declined" }));

    await expect(service.afterCompletion("jp-1", 10000, 500, { autoCharge: true })).resolves.toEqual({ balanceDueEurCents: 8000, autoChargedEurCents: 0 });
    expect(prisma.jobPayment.update).toHaveBeenCalledWith({ where: { id: "jp-1" }, data: { balanceAutoChargeFailedAt: expect.any(Date) } });
  });

  it("senza il via (importo sopra il preventivo) non addebita nulla", async () => {
    const { service, prisma, stripe } = buildService();
    prisma.jobPayment.findUniqueOrThrow.mockResolvedValue(closedJob());
    stripe.paymentIntents.create = vi.fn();

    await expect(service.afterCompletion("jp-1", 10000, 500)).resolves.toEqual({ balanceDueEurCents: 8000, autoChargedEurCents: 0 });
    expect(stripe.paymentIntents.create).not.toHaveBeenCalled();
  });
});

describe("OnlineMoneyService.alertLongHolds", () => {
  it("avvisa una volta il team Finanza dei soldi bloccati da più di 80 giorni", async () => {
    const { service, prisma, notificationsService } = buildService();
    const now = new Date("2026-12-31T10:00:00Z");
    prisma.jobPayment.findMany.mockResolvedValueOnce([
      { id: "jp-1", bookingId: "bk-1", depositPaidAt: new Date("2026-10-10T10:00:00Z"), balancePaidAt: null, booking: { quote: { guidedRequestId: "gr-1" } } },
    ]);
    prisma.user.findMany.mockResolvedValue([{ id: "admin-1", adminRoles: ["FINANCE"] }]);

    await expect(service.alertLongHolds(now)).resolves.toBe(1);
    expect(prisma.jobPayment.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ releasedAt: null, longHoldAlertedAt: null }) }));
    expect(prisma.jobPayment.updateMany).toHaveBeenCalledWith({ where: { id: "jp-1", longHoldAlertedAt: null }, data: { longHoldAlertedAt: now } });
    expect(notificationsService.notify).toHaveBeenCalledWith("admin-1", "ADMIN_JOB_PAYMENT_LONG_HOLD", { bookingId: "bk-1", guidedRequestId: "gr-1", days: 82 });
  });

  it("non avvisa due volte se un altro giro l'ha già fatto", async () => {
    const { service, prisma, notificationsService } = buildService();
    prisma.jobPayment.findMany.mockResolvedValueOnce([{ id: "jp-1", bookingId: "bk-1", depositPaidAt: new Date("2026-10-01"), balancePaidAt: null, booking: { quote: null } }]);
    prisma.jobPayment.updateMany.mockResolvedValueOnce({ count: 0 });

    await expect(service.alertLongHolds(new Date("2026-12-31"))).resolves.toBe(0);
    expect(notificationsService.notify).not.toHaveBeenCalled();
  });
});

describe("OnlineMoneyService.retryPayoutsForAccount", () => {
  it("con i soldi appena disponibili riprova solo i bonifici in attesa, non quelli rifiutati dalla banca", async () => {
    const { service, prisma } = buildService();
    await service.retryPayoutsForAccount("acct_1", { skipFailed: true });
    expect(prisma.jobPayment.findMany).toHaveBeenCalledWith({
      where: { stripeDestinationAccountId: "acct_1", payoutPendingEurCents: { gt: 0 }, payoutFailedAt: null },
      select: { id: true },
    });
  });
});

describe("professionalPayoutTotals", () => {
  it("somma quanto riceve il professionista per stato del bonifico", () => {
    const row = (payoutStatus: JobPaymentSummary["payoutStatus"], payoutEurCents: number) => ({ payoutStatus, payoutEurCents }) as JobPaymentSummary;
    expect(professionalPayoutTotals([row("BLOCKED", 1000), row("WAITING_FUNDS", 500), row("FAILED", 200), row("SENT", 300), row("PAID", 400), row("PAID", 100), null])).toEqual({
      blockedEurCents: 1000,
      preparingEurCents: 700,
      sentEurCents: 300,
      paidEurCents: 500,
      hasFailed: true,
    });
  });
});

describe("OnlineMoneyService: acconto trattenuto per un annullamento dentro il preavviso (§348)", () => {
  function keptJob() {
    return {
      ...releasedJob({
        onlineStage: "PAID",
        releasedAt: null,
        paidEurCents: 2400,
        applicationFeeEurCents: 250,
        payoutPendingEurCents: 0,
        netAmountEurCents: 0,
        stripeFeeEurCents: 60,
        platformFeeEurCents: 120,
        grossAmountEurCents: 2400,
        depositKeptAt: new Date("2026-10-01T10:00:00Z"),
        releaseDueAt: new Date("2026-10-08T10:00:00Z"),
      }),
      booking: {
        id: "bk-1",
        clientId: "client-1",
        status: "CANCELED",
        finalAmountEurCents: null,
        professionalCompletedAt: null,
        clientConfirmedCompletedAt: null,
        issue: null,
        professionalProfile: { id: "pro-1", userId: "pro-user-1", fiscalProfile: { stripeConnectAccountId: "acct_1", stripePayoutsEnabled: true } },
        quote: { guidedRequestId: "gr-1" },
      },
    };
  }

  it("keepDeposit fissa l'acconto come importo, con la trattenuta del 7% + IVA, e lo sblocca dopo 7 giorni", async () => {
    const { service, prisma } = buildService();
    prisma.jobPayment.findUniqueOrThrow.mockResolvedValue({ id: "jp-1", paymentMethod: "MANOVIA", releasedAt: null, paidEurCents: 2400, refundedEurCents: 0, stripeFeeEurCents: 60 });
    await expect(service.keepDeposit("jp-1")).resolves.toBe(2400);
    expect(prisma.jobPayment.update).toHaveBeenCalledWith({
      where: { id: "jp-1" },
      data: expect.objectContaining({ grossAmountEurCents: 2400, platformFeeEurCents: 205, netAmountEurCents: 2400 - 205 - 60, onlineStage: "PAID", depositKeptAt: expect.any(Date), releaseDueAt: expect.any(Date) }),
    });
  });

  it("prima della scadenza resta bloccato, dopo passa al professionista senza rimborsi al cliente", async () => {
    const { service, prisma, stripe } = buildService();
    const job = keptJob();
    prisma.jobPayment.findUnique.mockResolvedValue(job);
    await expect(service.releaseIfDue("jp-1", new Date("2026-10-05T10:00:00Z"))).resolves.toBe(false);

    prisma.jobPayment.findUnique.mockReset();
    prisma.jobPayment.findUnique.mockResolvedValueOnce(job).mockResolvedValue(releasedJob({ payoutPendingEurCents: 0 }));
    prisma.jobPayment.findUniqueOrThrow.mockResolvedValue(job);
    prisma.jobPayment.count.mockResolvedValue(1);
    stripe.paymentIntents.retrieve.mockImplementation(async (_pi: string, opts: { expand: string[] }) =>
      opts.expand[0] === "latest_charge.transfer"
        ? { latest_charge: { transfer: { id: "tr_1", amount: 2400, amount_reversed: 0 } } }
        : { latest_charge: { application_fee: { id: "fee_1", amount: 250, amount_refunded: 0 } } },
    );
    await expect(service.releaseIfDue("jp-1", new Date("2026-10-09T10:00:00Z"))).resolves.toBe(true);
    expect(stripe.refunds.create).not.toHaveBeenCalled();
    expect(prisma.jobPayment.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ onlineStage: "RELEASED" }) }));
  });
});
