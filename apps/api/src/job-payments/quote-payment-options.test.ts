import { describe, expect, it, vi } from "vitest";
import { onlineTargetEurCents, quotePaymentOffer, quoteSelfSchema, toJobPaymentSummary } from "@professionisti/shared";
import { OnlineMoneyService } from "./online-money.service";

/**
 * Modi di pagamento scelti dal professionista nel preventivo
 * (docs/CHANGELOG.md §237): acconto online a percentuale libera, saldo
 * online o diretto. Col saldo diretto da Stripe passa solo l'acconto.
 */
describe("quotePaymentOffer", () => {
  it("i preventivi vecchi offrono online con acconto del 20% e diretto", () => {
    expect(quotePaymentOffer({ paymentOptions: [], depositPercent: null })).toEqual({ paymentOptions: ["ONLINE", "DIRECT"], depositPercent: 20 });
  });

  it("tiene l'ordine fisso e scarta valori sconosciuti", () => {
    expect(quotePaymentOffer({ paymentOptions: ["DIRECT", "X", "MIXED"], depositPercent: 50 })).toEqual({ paymentOptions: ["MIXED", "DIRECT"], depositPercent: 50 });
  });
});

describe("quoteSelfSchema — modi di pagamento", () => {
  const base = { requestId: "7c9e6679-7425-40de-944b-e07fc1f90ae7", items: [{ name: "Manodopera", priceMaxEurCents: 10000 }], estimatedStartDate: "2026-10-20T10:00:00.000Z" };

  it("accetta da 1 a 100%", () => {
    expect(quoteSelfSchema.safeParse({ ...base, paymentOptions: ["ONLINE"], depositPercent: 1 }).success).toBe(true);
    expect(quoteSelfSchema.safeParse({ ...base, paymentOptions: ["ONLINE"], depositPercent: 100 }).success).toBe(true);
    expect(quoteSelfSchema.safeParse({ ...base, paymentOptions: ["ONLINE"], depositPercent: 0 }).success).toBe(false);
    expect(quoteSelfSchema.safeParse({ ...base, paymentOptions: ["ONLINE"], depositPercent: 101 }).success).toBe(false);
    expect(quoteSelfSchema.safeParse({ ...base, paymentOptions: ["ONLINE"], depositPercent: 12.5 }).success).toBe(false);
  });

  it("vuole almeno un modo di pagamento", () => {
    expect(quoteSelfSchema.safeParse({ ...base, paymentOptions: [] }).success).toBe(false);
  });
});

describe("onlineTargetEurCents", () => {
  it("col saldo diretto online passa solo l'acconto, al massimo l'importo finale", () => {
    expect(onlineTargetEurCents(50000, { balanceDirect: true, depositEurCents: 10000 })).toBe(10000);
    expect(onlineTargetEurCents(8000, { balanceDirect: true, depositEurCents: 10000 })).toBe(8000);
    expect(onlineTargetEurCents(50000, { balanceDirect: false, depositEurCents: 10000 })).toBe(50000);
  });
});

describe("toJobPaymentSummary con saldo diretto", () => {
  it("nessun saldo online e il resto da pagare al professionista", () => {
    const summary = toJobPaymentSummary(
      {
        paymentMethod: "MANOVIA",
        balanceDirect: true,
        onlineStage: "PAID",
        depositEurCents: 10000,
        paidEurCents: 10000,
        refundedEurCents: 0,
        platformFeeEurCents: 0,
        stripeFeeEurCents: 0,
        netAmountEurCents: 0,
        releaseDueAt: null,
        releasedAt: null,
        balanceUnpaidAt: null,
      },
      50000,
      true,
    );
    // Trattenuta solo sui 100 € passati online: 7% + IVA = 8,54 €.
    expect(summary).toMatchObject({ method: "ONLINE", balanceDirect: true, balanceDueEurCents: 0, directBalanceEurCents: 40000, appFeeEurCents: 854, payoutEurCents: 10000 - 854 });
  });
});

function buildService() {
  const prisma = {
    jobPayment: { findUnique: vi.fn(), findUniqueOrThrow: vi.fn(), update: vi.fn(), updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    manoviaRevenue: { create: vi.fn() },
    professionalFiscalProfile: { updateMany: vi.fn() },
    user: { findMany: vi.fn().mockResolvedValue([]) },
  };
  const stripe = {
    transfers: { create: vi.fn().mockResolvedValue({ id: "tr_1" }) },
    refunds: { create: vi.fn() },
    paymentIntents: { retrieve: vi.fn().mockResolvedValue({ latest_charge: { amount: 10000, amount_refunded: 0 } }) },
  };
  const service = new OnlineMoneyService(prisma as never, { record: vi.fn() } as never, { notify: vi.fn() } as never);
  (service as unknown as { stripe: unknown }).stripe = stripe;
  return { service, prisma, stripe };
}

function mixedJob(finalAmountEurCents: number) {
  return {
    id: "jp-1",
    bookingId: "bk-1",
    paymentMethod: "MANOVIA",
    balanceDirect: true,
    status: "PENDING",
    onlineStage: "PAID",
    releasedAt: null,
    releaseDueAt: null,
    depositEurCents: 10000,
    paidEurCents: 10000,
    refundedEurCents: 0,
    stripeFeeEurCents: 300,
    platformFeeEurCents: 500,
    stripePaymentIntentId: "pi_dep",
    balancePaymentIntentId: null,
    stripeTransferId: null,
    stripeDisputeId: null,
    stripeDisputeStatus: null,
    netAmountEurCents: 0,
    booking: {
      id: "bk-1",
      clientId: "client-1",
      finalAmountEurCents,
      professionalCompletedAt: new Date("2026-10-01T10:00:00Z"),
      clientConfirmedCompletedAt: new Date("2026-10-01T12:00:00Z"),
      issue: null,
      professionalProfile: { id: "pro-1", userId: "pro-user-1", fiscalProfile: { stripeConnectAccountId: "acct_1", stripePayoutsEnabled: true } },
      quote: { guidedRequestId: "gr-1" },
    },
  };
}

describe("OnlineMoneyService con saldo diretto", () => {
  it("a lavoro chiuso non chiede nessun saldo online", async () => {
    const { service, prisma } = buildService();
    prisma.jobPayment.findUniqueOrThrow.mockResolvedValue({ ...mixedJob(50000), booking: undefined });

    await expect(service.afterCompletion("jp-1", 50000, 500)).resolves.toEqual({ balanceDueEurCents: 0, autoChargedEurCents: 0 });
    expect(prisma.jobPayment.update).toHaveBeenCalledWith({ where: { id: "jp-1" }, data: expect.objectContaining({ onlineStage: "PAID", netAmountEurCents: 9200 }) });
  });

  it("accredita l'acconto meno costi, senza rimborsi se l'importo finale lo supera", async () => {
    const { service, prisma, stripe } = buildService();
    prisma.jobPayment.findUnique.mockResolvedValue(mixedJob(50000));
    vi.spyOn(service as unknown as { accountActive: () => Promise<boolean> }, "accountActive").mockResolvedValue(true);

    await expect(service.releaseIfDue("jp-1")).resolves.toBe(true);
    expect(stripe.refunds.create).not.toHaveBeenCalled();
    expect(stripe.transfers.create).toHaveBeenCalledWith(expect.objectContaining({ amount: 10000 - 300 - 500 }), expect.anything());
  });

  it("se l'importo finale è sotto l'acconto rimborsa la differenza al cliente", async () => {
    const { service, prisma, stripe } = buildService();
    prisma.jobPayment.findUnique.mockResolvedValue(mixedJob(8000));
    prisma.jobPayment.findUniqueOrThrow.mockResolvedValue(mixedJob(8000));
    vi.spyOn(service as unknown as { accountActive: () => Promise<boolean> }, "accountActive").mockResolvedValue(true);

    await service.releaseIfDue("jp-1");
    expect(stripe.refunds.create).toHaveBeenCalledWith(expect.objectContaining({ payment_intent: "pi_dep", amount: 2000 }), expect.anything());
    expect(stripe.transfers.create).toHaveBeenCalledWith(expect.objectContaining({ amount: 8000 - 300 - 500 }), expect.anything());
  });
});
