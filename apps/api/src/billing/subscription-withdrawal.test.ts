import { describe, expect, it, vi } from "vitest";
import { subscriptionWithdrawalRefundEurCents } from "@professionisti/shared";
import { SubscriptionWithdrawalService } from "./subscription-withdrawal.service";

/** Recesso entro 14 giorni (docs/changelog/2026-11-26-recesso-abbonamento.md). */

describe("rimborso del recesso", () => {
  it("toglie la parte più alta tra giorni e lavori usati", () => {
    // Base 23,18 € IVA inclusa, 3 giorni su 30 e 1 lavoro su 3: conta il lavoro (un terzo).
    expect(subscriptionWithdrawalRefundEurCents({ paidEurCents: 2318, daysUsed: 3, periodDays: 30, jobsUsed: 1, jobsLimit: 3 })).toBe(1545);
    // Nessun lavoro: contano i giorni.
    expect(subscriptionWithdrawalRefundEurCents({ paidEurCents: 3000, daysUsed: 3, periodDays: 30, jobsUsed: 0, jobsLimit: 3 })).toBe(2700);
    // Tutti i lavori usati: niente rimborso.
    expect(subscriptionWithdrawalRefundEurCents({ paidEurCents: 3000, daysUsed: 1, periodDays: 30, jobsUsed: 3, jobsLimit: 3 })).toBe(0);
  });

  it("su Pro, senza limite di lavori, contano solo i giorni", () => {
    expect(subscriptionWithdrawalRefundEurCents({ paidEurCents: 12078, daysUsed: 6, periodDays: 30, jobsUsed: 40, jobsLimit: null })).toBe(9662);
  });
});

const NOW = new Date("2026-12-10T10:00:00Z");
const seconds = (iso: string) => Math.floor(new Date(iso).getTime() / 1000);

function invoice(id: string, paidAt: string, price: string, amount = 2318) {
  return {
    id,
    amount_paid: amount,
    created: seconds(paidAt),
    status_transitions: { paid_at: seconds(paidAt) },
    lines: { data: [{ amount, period: { start: seconds(paidAt), end: seconds(paidAt) + 30 * 86_400 }, pricing: { price_details: { price } } }] },
  };
}

function setup(options: { entityType?: string; invoices?: unknown[]; pending?: boolean; decidedForInvoice?: boolean } = {}) {
  const prisma = {
    professionalProfile: {
      findUnique: vi.fn(({ where }: { where: { userId?: string; id?: string } }) =>
        Promise.resolve(where.userId ? { id: "p1", businessName: "Mario Idraulico", fiscalProfile: { entityType: options.entityType ?? "PRIVATE_INDIVIDUAL" } } : { userId: "u1" }),
      ),
      findMany: vi.fn().mockResolvedValue([{ id: "p1", businessName: "Mario Idraulico" }]),
    },
    subscription: {
      findUnique: vi.fn().mockResolvedValue({ id: "s1", stripeSubscriptionId: "sub_1", status: "ACTIVE", tier: "BASE" }),
      update: vi.fn().mockResolvedValue({}),
    },
    subscriptionWithdrawal: {
      findFirst: vi.fn(({ where }: { where: { status?: string; stripeInvoiceId?: string } }) => {
        if (where.status === "PENDING") return Promise.resolve(options.pending ? { id: "w0", createdAt: new Date("2026-12-09T10:00:00Z") } : null);
        return Promise.resolve(options.decidedForInvoice ? { id: "w0" } : null);
      }),
      create: vi.fn(({ data }: { data: Record<string, unknown> }) => Promise.resolve({ id: "w1", createdAt: NOW, ...data })),
      findUnique: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      findUniqueOrThrow: vi.fn(),
    },
  };
  const subscriptions = { countUsedJobs: vi.fn().mockResolvedValue(0) };
  const notifications = { notify: vi.fn().mockResolvedValue(undefined) };
  const audit = { record: vi.fn().mockResolvedValue(undefined) };
  const invoices = { notifyFinanceAdmins: vi.fn().mockResolvedValue(undefined) };
  const stripe = {
    invoices: { list: vi.fn().mockResolvedValue({ data: options.invoices ?? [invoice("in_1", "2026-12-07T10:00:00Z", "price_base")] }) },
    invoicePayments: { list: vi.fn().mockResolvedValue({ data: [{ payment: { payment_intent: "pi_1" } }] }) },
    subscriptions: { cancel: vi.fn().mockResolvedValue({}) },
    refunds: { create: vi.fn().mockResolvedValue({}) },
  };
  const service = new SubscriptionWithdrawalService(prisma as never, subscriptions as never, notifications as never, audit as never, invoices as never);
  (service as unknown as { stripe: unknown }).stripe = stripe;
  return { service, prisma, notifications, audit, invoices, stripe };
}

describe("recesso dall'abbonamento", () => {
  it("lo offre a chi lavora senza partita IVA, entro 14 giorni dal primo pagamento", async () => {
    const { service } = setup();
    const option = await service.myOption("u1", NOW);
    expect(option).toMatchObject({ state: "AVAILABLE", paidEurCents: 2318, until: "2026-12-21T10:00:00.000Z" });
    // 3 giorni su 30, nessun lavoro: 90% di 23,18 €.
    expect(option?.state === "AVAILABLE" && option.estimatedRefundEurCents).toBe(2086);
  });

  it("non lo offre a chi ha la partita IVA", async () => {
    const { service, stripe } = setup({ entityType: "SOLE_TRADER" });
    expect(await service.myOption("u1", NOW)).toBeNull();
    expect(stripe.invoices.list).not.toHaveBeenCalled();
  });

  it("non lo offre dopo 14 giorni né per un rinnovo dello stesso livello", async () => {
    expect(await setup({ invoices: [invoice("in_1", "2026-11-20T10:00:00Z", "price_base")] }).service.myOption("u1", NOW)).toBeNull();
    const renewal = [invoice("in_2", "2026-12-07T10:00:00Z", "price_base"), invoice("in_1", "2026-11-07T10:00:00Z", "price_base")];
    expect(await setup({ invoices: renewal }).service.myOption("u1", NOW)).toBeNull();
  });

  it("passando a un livello superiore vale il nuovo pagamento", async () => {
    const upgrade = [invoice("in_2", "2026-12-07T10:00:00Z", "price_plus", 7198), invoice("in_1", "2026-11-07T10:00:00Z", "price_base")];
    expect(await setup({ invoices: upgrade }).service.myOption("u1", NOW)).toMatchObject({ state: "AVAILABLE", paidEurCents: 7198 });
  });

  it("una sola richiesta per pagamento", async () => {
    expect(await setup({ pending: true }).service.myOption("u1", NOW)).toEqual({ state: "REQUESTED", requestedAt: "2026-12-09T10:00:00.000Z" });
    expect(await setup({ decidedForInvoice: true }).service.myOption("u1", NOW)).toBeNull();
    await expect(setup({ decidedForInvoice: true }).service.request("u1", undefined, NOW)).rejects.toThrow(/entro 14 giorni/);
  });

  it("la richiesta salva il rimborso calcolato e avvisa professionista e Finanza", async () => {
    const { service, prisma, notifications, invoices } = setup();
    expect(await service.request("u1", "  Non mi serve  ", NOW)).toEqual({ state: "REQUESTED", requestedAt: NOW.toISOString() });
    expect(prisma.subscriptionWithdrawal.create.mock.calls[0]![0].data).toMatchObject({
      professionalProfileId: "p1",
      reason: "Non mi serve",
      stripeInvoiceId: "in_1",
      stripePaymentIntentId: "pi_1",
      paidEurCents: 2318,
      daysUsed: 3,
      periodDays: 30,
      proposedRefundEurCents: 2086,
    });
    expect(notifications.notify).toHaveBeenCalledWith("u1", "SUBSCRIPTION_WITHDRAWAL_RECEIVED", expect.objectContaining({ refundEurCents: 2086 }));
    expect(invoices.notifyFinanceAdmins).toHaveBeenCalledWith("ADMIN_SUBSCRIPTION_WITHDRAWAL", { businessName: "Mario Idraulico", refundEurCents: 2086 });
  });

  it("approvando chiude l'abbonamento e rimborsa, mai oltre quanto pagato", async () => {
    const { service, prisma, stripe, notifications } = setup();
    prisma.subscriptionWithdrawal.findUnique.mockResolvedValue({
      id: "w1",
      status: "PENDING",
      professionalProfileId: "p1",
      paidEurCents: 2318,
      proposedRefundEurCents: 2086,
      stripePaymentIntentId: "pi_1",
      tierLabel: "Base mensile",
    });
    await service.approve("admin1", "w1", 9999, undefined);
    expect(prisma.subscriptionWithdrawal.updateMany.mock.calls[0]![0]).toMatchObject({ where: { id: "w1", status: "PENDING" }, data: { status: "APPROVED", refundEurCents: 2318 } });
    expect(stripe.subscriptions.cancel).toHaveBeenCalledWith("sub_1", { prorate: false, invoice_now: false }, { idempotencyKey: "recesso-w1" });
    expect(prisma.subscription.update.mock.calls[0]![0].data).toMatchObject({ status: "CANCELED" });
    expect(stripe.refunds.create.mock.calls[0]![0]).toMatchObject({ payment_intent: "pi_1", amount: 2318 });
    expect(stripe.refunds.create.mock.calls[0]![1]).toEqual({ idempotencyKey: "rimborso-recesso-w1" });
    expect(notifications.notify).toHaveBeenCalledWith("u1", "SUBSCRIPTION_WITHDRAWAL_DONE", { tierLabel: "Base mensile", refundEurCents: 2318 });
  });

  it("un secondo tocco su Approva non rimborsa due volte", async () => {
    const { service, prisma, stripe } = setup();
    prisma.subscriptionWithdrawal.findUnique.mockResolvedValue({ id: "w1", status: "PENDING", professionalProfileId: "p1", paidEurCents: 2318, proposedRefundEurCents: 2086, stripePaymentIntentId: "pi_1" });
    prisma.subscriptionWithdrawal.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.approve("admin1", "w1", undefined, undefined)).rejects.toThrow(/già stata decisa/);
    expect(stripe.refunds.create).not.toHaveBeenCalled();
  });

  it("rifiutando manda il motivo al professionista", async () => {
    const { service, prisma, notifications } = setup();
    prisma.subscriptionWithdrawal.findUniqueOrThrow.mockResolvedValue({ id: "w1", professionalProfileId: "p1", tierLabel: "Base mensile" });
    await service.reject("admin1", "w1", " Oltre i 14 giorni ");
    expect(notifications.notify).toHaveBeenCalledWith("u1", "SUBSCRIPTION_WITHDRAWAL_REJECTED", { tierLabel: "Base mensile", reason: "Oltre i 14 giorni" });
  });
});
