import { afterEach, describe, expect, it, vi } from "vitest";
import { ConflictException } from "@nestjs/common";
import { BillingService } from "./billing.service";

/**
 * Controllo prima del lancio dell'8/11/2026, gruppo 2 (abbonamento):
 * chiusura dell'account (E1-01), doppi abbonamenti (E3-01), quota di
 * passaggio a metà (E3-02), rinnovo non pagato (E3-03), righe dei pagamenti (E3-09).
 */
const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-12-10T10:00:00Z");

function buildService() {
  const prisma = {
    stripeWebhookEvent: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn(), delete: vi.fn() },
    payment: { create: vi.fn() },
    subscription: { findUnique: vi.fn(), findMany: vi.fn().mockResolvedValue([]), update: vi.fn().mockResolvedValue({}), updateMany: vi.fn().mockResolvedValue({ count: 1 }), upsert: vi.fn() },
    professionalProfile: { findUnique: vi.fn(), findFirst: vi.fn().mockResolvedValue(null) },
  };
  const subscriptionsService = { applyStripeSubscription: vi.fn(), onInvoice: vi.fn(), notifyPaid: vi.fn() };
  const invoicesService = { issueForStripeInvoice: vi.fn().mockResolvedValue(true), notifyFinanceAdmins: vi.fn() };
  const stripe = {
    webhooks: { constructEvent: vi.fn() },
    subscriptions: { cancel: vi.fn().mockResolvedValue({}), retrieve: vi.fn(), update: vi.fn() },
    invoices: { retrieve: vi.fn(), create: vi.fn(), pay: vi.fn(), voidInvoice: vi.fn(), del: vi.fn() },
    invoiceItems: { create: vi.fn() },
  };
  const service = new BillingService(prisma as never, {} as never, {} as never, {} as never, subscriptionsService as never, invoicesService as never);
  (service as unknown as { stripe: unknown }).stripe = stripe;
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
  process.env.STRIPE_PRICE_BASE = "price_base_m";
  process.env.STRIPE_PRICE_PLUS = "price_plus_m";
  process.env.STRIPE_PRICE_PRO = "price_pro_m";
  process.env.STRIPE_TAX_RATE_IVA = "txr_1";
  delete process.env.STRIPE_CONNECT_WEBHOOK_SECRET;
  return { service, prisma, stripe, subscriptionsService, invoicesService };
}

const stripeSubscription = (price: string, status = "active") => ({
  id: "sub_1",
  status,
  customer: "cus_1",
  metadata: { professionalProfileId: "pro-1" },
  cancel_at_period_end: false,
  default_payment_method: "pm_1",
  items: { data: [{ id: "si_1", price: { id: price }, current_period_start: (NOW.getTime() - 10 * DAY) / 1000, current_period_end: (NOW.getTime() + 20 * DAY) / 1000 }] },
});

afterEach(() => {
  vi.useRealTimers();
  for (const key of ["STRIPE_PRICE_BASE", "STRIPE_PRICE_PLUS", "STRIPE_PRICE_PRO", "STRIPE_TAX_RATE_IVA", "LAUNCH_DATE"]) delete process.env[key];
});

describe("chiusura dell'account del professionista (E1-01)", () => {
  it("annulla subito l'abbonamento su Stripe e lo segna concluso", async () => {
    const { service, prisma, stripe } = buildService();
    prisma.subscription.findUnique.mockResolvedValue({ id: "s-1", status: "ACTIVE", stripeSubscriptionId: "sub_1" });

    await service.cancelForClosedAccount("pro-1");

    expect(stripe.subscriptions.cancel).toHaveBeenCalledWith("sub_1", { prorate: false, invoice_now: false }, { idempotencyKey: "chiusura-account-s-1" });
    expect(prisma.subscription.update).toHaveBeenCalledWith({ where: { id: "s-1" }, data: expect.objectContaining({ status: "CANCELED", returnToBaseAt: null }) });
  });

  it("se Stripe non risponde la riga resta attiva, così il controllo orario riprova", async () => {
    const { service, prisma, stripe } = buildService();
    prisma.subscription.findUnique.mockResolvedValue({ id: "s-1", status: "ACTIVE", stripeSubscriptionId: "sub_1" });
    stripe.subscriptions.cancel.mockRejectedValue(new Error("rete"));

    await expect(service.cancelForClosedAccount("pro-1")).rejects.toThrow("rete");
    expect(prisma.subscription.update).not.toHaveBeenCalled();
  });
});

describe("controllo orario dell'abbonamento", () => {
  it("chiude un rinnovo non pagato da più di 14 giorni (E3-03)", async () => {
    vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
    const { service, prisma, stripe, subscriptionsService } = buildService();
    const since = new Date(NOW.getTime() - 15 * DAY);
    prisma.subscription.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: "s-1", stripeSubscriptionId: "sub_1", pastDueSince: since }]).mockResolvedValueOnce([]);
    stripe.subscriptions.retrieve.mockResolvedValue({ ...stripeSubscription("price_base_m", "canceled") });

    await service.runSubscriptionSafetyChecks(NOW);

    expect(prisma.subscription.findMany.mock.calls[1]![0].where.pastDueSince).toEqual({ lte: new Date(NOW.getTime() - 14 * DAY) });
    expect(stripe.subscriptions.cancel).toHaveBeenCalledWith("sub_1", { prorate: false, invoice_now: false }, { idempotencyKey: `rinnovo-non-pagato-s-1-${since.getTime()}` });
    expect(subscriptionsService.applyStripeSubscription).toHaveBeenCalledWith(expect.objectContaining({ stripeSubscriptionId: "sub_1", status: "CANCELED" }));
  });

  it("dà il livello di una quota di passaggio già pagata (E3-02)", async () => {
    const { service, prisma, stripe } = buildService();
    prisma.subscription.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: "s-1", stripeSubscriptionId: "sub_1", upgradeInvoiceId: "in_fee" }]);
    prisma.subscription.findUnique.mockResolvedValue({ upgradeInvoiceId: "in_fee" });
    stripe.invoices.retrieve.mockResolvedValue({ id: "in_fee", status: "paid", metadata: { plan: "PLUS", stripeSubscriptionId: "sub_1" } });
    stripe.subscriptions.retrieve.mockResolvedValue(stripeSubscription("price_base_m"));
    stripe.subscriptions.update.mockResolvedValue(stripeSubscription("price_plus_m"));

    await service.runSubscriptionSafetyChecks(NOW);

    expect(stripe.subscriptions.update).toHaveBeenCalledWith("sub_1", { items: [{ id: "si_1", price: "price_plus_m" }], proration_behavior: "none", cancel_at_period_end: false });
    expect(prisma.subscription.update).toHaveBeenCalledWith({ where: { id: "s-1" }, data: { upgradeInvoiceId: null } });
  });
});

describe("passaggio di livello con la quota (E3-02)", () => {
  function paidBase(prisma: ReturnType<typeof buildService>["prisma"]) {
    process.env.LAUNCH_DATE = "2026-11-02";
    prisma.professionalProfile.findUnique.mockResolvedValue({ id: "pro-1", businessName: "Idraulica Rossi", stripeCustomerId: "cus_1", user: { email: "pro@example.com" } });
    prisma.subscription.findUnique.mockImplementation(({ select }: { select?: Record<string, boolean> }) => {
      if (select?.upgradeInvoiceId) return Promise.resolve({ upgradeInvoiceId: null });
      return Promise.resolve({ id: "s-1", plan: "BASE", status: "ACTIVE", stripeSubscriptionId: "sub_1", trialEndsAt: null, currentPeriodEnd: new Date(NOW.getTime() + 20 * DAY) });
    });
  }

  it("ricorda la fattura prima di pagarla e la toglie solo a livello cambiato", async () => {
    vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
    const { service, prisma, stripe } = buildService();
    paidBase(prisma);
    stripe.subscriptions.retrieve.mockResolvedValue(stripeSubscription("price_base_m"));
    stripe.invoices.create.mockResolvedValue({ id: "in_fee" });
    stripe.invoices.pay.mockResolvedValue({ amount_paid: 3500 });
    stripe.subscriptions.update.mockResolvedValue(stripeSubscription("price_plus_m"));

    await expect(service.createSubscriptionCheckout("user-1", "PLUS")).resolves.toEqual({ url: null });

    const writes = prisma.subscription.update.mock.calls.map((call) => call[0].data);
    expect(writes).toContainEqual({ upgradeInvoiceId: "in_fee" });
    expect(stripe.invoiceItems.create).toHaveBeenCalledWith(expect.objectContaining({ invoice: "in_fee" }), { idempotencyKey: "tier-upgrade-item-in_fee" });
    expect(writes.indexOf(writes.find((d) => d.upgradeInvoiceId === null)!)).toBeGreaterThan(writes.findIndex((d) => d.upgradeInvoiceId === "in_fee"));
    // La riga del pagamento la scrive `invoice.paid`, non il clic (E3-09).
    expect(prisma.payment.create).not.toHaveBeenCalled();
  });

  it("livello non cambiato dopo la quota: messaggio chiaro, la fattura resta da finire", async () => {
    vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
    const { service, prisma, stripe } = buildService();
    paidBase(prisma);
    stripe.subscriptions.retrieve.mockResolvedValue(stripeSubscription("price_base_m"));
    stripe.invoices.create.mockResolvedValue({ id: "in_fee" });
    stripe.invoices.pay.mockResolvedValue({ amount_paid: 3500 });
    stripe.subscriptions.update.mockRejectedValue(new Error("Stripe 500"));

    await expect(service.createSubscriptionCheckout("user-1", "PLUS")).rejects.toThrow("senza pagare di nuovo");
    expect(prisma.subscription.update.mock.calls.map((call) => call[0].data)).not.toContainEqual({ upgradeInvoiceId: null });
  });

  it("con un passaggio già in corso da un'altra scheda non paga di nuovo", async () => {
    vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
    const { service, prisma, stripe } = buildService();
    paidBase(prisma);
    prisma.subscription.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.createSubscriptionCheckout("user-1", "PLUS")).rejects.toThrow(ConflictException);
    expect(stripe.invoices.create).not.toHaveBeenCalled();
  });
});

describe("webhook dell'abbonamento", () => {
  it("secondo abbonamento da una seconda scheda: annullato, la riga resta sul primo, la Finanza rimborsa (E3-01)", async () => {
    const { service, prisma, stripe, invoicesService } = buildService();
    stripe.webhooks.constructEvent.mockReturnValue({
      id: "evt_1",
      type: "checkout.session.completed",
      data: { object: { payment_status: "paid", subscription: "sub_2", amount_total: 2318, metadata: { kind: "subscription", professionalProfileId: "pro-1", plan: "BASE" } } },
    });
    prisma.subscription.findUnique.mockResolvedValue({ stripeSubscriptionId: "sub_1" });
    stripe.subscriptions.retrieve.mockResolvedValue(stripeSubscription("price_base_m", "active"));

    await service.handleWebhookEvent(Buffer.from("{}"), "sig");

    expect(stripe.subscriptions.cancel).toHaveBeenCalledWith("sub_2", { prorate: false, invoice_now: false }, { idempotencyKey: "doppione-sub_2" });
    expect(prisma.subscription.upsert).not.toHaveBeenCalled();
    expect(invoicesService.notifyFinanceAdmins).toHaveBeenCalledWith("ADMIN_SUBSCRIPTION_DUPLICATE", expect.objectContaining({ amountEurCents: 2318, stripeSubscriptionId: "sub_2" }));
  });

  it("una riga di pagamento per ogni addebito dell'abbonamento, mai per la carta a 0 € (E3-09)", async () => {
    const { service, prisma, stripe } = buildService();
    prisma.subscription.findUnique.mockResolvedValue({ id: "s-1", professionalProfileId: "pro-1" });
    const paid = (amount: number, reason: string) => ({
      id: `evt_${amount}_${reason}`,
      type: "invoice.paid",
      data: { object: { id: "in_1", amount_paid: amount, billing_reason: reason, metadata: {}, lines: { data: [] }, parent: { subscription_details: { subscription: "sub_1" } } } },
    });
    stripe.webhooks.constructEvent.mockReturnValueOnce(paid(0, "subscription_create")).mockReturnValueOnce(paid(4000, "subscription_update")).mockReturnValueOnce(paid(2318, "subscription_cycle"));

    for (let i = 0; i < 3; i++) await service.handleWebhookEvent(Buffer.from("{}"), "sig");

    expect(prisma.payment.create.mock.calls.map((call) => call[0].data.amountEurCents)).toEqual([4000, 2318]);
  });
});
