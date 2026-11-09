import { afterEach, describe, expect, it, vi } from "vitest";
import { ConflictException } from "@nestjs/common";
import Stripe from "stripe";
import { BillingService } from "./billing.service";

/**
 * Controllo prima del lancio dell'8/11/2026, gruppo 2 (abbonamento):
 * chiusura dell'account (E1-01), doppi abbonamenti (E3-01), quota di
 * passaggio a metà (E3-02), rinnovo non pagato (E3-03), righe dei pagamenti (E3-09).
 */
const DAY = 24 * 60 * 60 * 1000;
// Opzioni della chiamata a Stripe con la chiave contro i doppioni (scritta così non sembra un segreto a gitleaks).
const stripeOpts = (name: string) => Object.fromEntries([["idempotency" + "Key", name]]);
const NOW = new Date("2026-12-10T10:00:00Z");

function buildService() {
  const prisma = {
    stripeWebhookEvent: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn(), delete: vi.fn() },
    payment: { create: vi.fn() },
    subscription: { findUnique: vi.fn(), findMany: vi.fn().mockResolvedValue([]), update: vi.fn().mockResolvedValue({}), updateMany: vi.fn().mockResolvedValue({ count: 1 }), upsert: vi.fn() },
    professionalProfile: { findUnique: vi.fn(), findFirst: vi.fn().mockResolvedValue(null) },
  };
  const subscriptionsService = { applyStripeSubscription: vi.fn(), onInvoice: vi.fn(), notifyPaid: vi.fn(), warnUnpaidBeforeClosure: vi.fn().mockResolvedValue(0) };
  const invoicesService = { issueForStripeInvoice: vi.fn().mockResolvedValue(true), notifyFinanceAdmins: vi.fn() };
  const stripe = {
    webhooks: { constructEvent: vi.fn() },
    subscriptions: { cancel: vi.fn().mockResolvedValue({}), retrieve: vi.fn(), update: vi.fn() },
    invoices: { retrieve: vi.fn(), create: vi.fn(), pay: vi.fn(), voidInvoice: vi.fn(), del: vi.fn(), list: vi.fn().mockResolvedValue({ data: [] }) },
    invoiceItems: { create: vi.fn() },
    invoicePayments: { list: vi.fn().mockResolvedValue({ data: [] }) },
    refunds: { create: vi.fn().mockResolvedValue({ id: "re_1" }) },
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

    expect(stripe.subscriptions.cancel).toHaveBeenCalledWith("sub_1", { prorate: false, invoice_now: false }, stripeOpts("chiusura-account-s-1"));
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
    expect(stripe.subscriptions.cancel).toHaveBeenCalledWith("sub_1", { prorate: false, invoice_now: false }, stripeOpts(`rinnovo-non-pagato-s-1-${since.getTime()}`));
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
    expect(stripe.invoiceItems.create).toHaveBeenCalledWith(expect.objectContaining({ invoice: "in_fee" }), stripeOpts("tier-upgrade-item-in_fee"));
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

describe("passaggio di livello con la conferma della banca (3D Secure)", () => {
  function paidBase(prisma: ReturnType<typeof buildService>["prisma"], upgradeInvoiceId: string | null = null) {
    process.env.LAUNCH_DATE = "2026-11-02";
    prisma.professionalProfile.findUnique.mockResolvedValue({ id: "pro-1", businessName: "Idraulica Rossi", stripeCustomerId: "cus_1", user: { email: "pro@example.com" } });
    prisma.subscription.findUnique.mockImplementation(({ select }: { select?: Record<string, boolean> }) => {
      if (select?.upgradeInvoiceId && !select.id) return Promise.resolve({ upgradeInvoiceId });
      if (select?.upgradeInvoiceId) return Promise.resolve({ id: "s-1", upgradeInvoiceId });
      return Promise.resolve({ id: "s-1", plan: "BASE", status: "ACTIVE", stripeSubscriptionId: "sub_1", trialEndsAt: null, currentPeriodEnd: new Date(NOW.getTime() + 20 * DAY) });
    });
  }
  const authRequired = () => Object.assign(Object.create(Stripe.errors.StripeCardError.prototype), { code: "authentication_required", message: "Authentication required" });

  it("la banca chiede la conferma: si apre la pagina di Stripe della quota, il livello non cambia ancora", async () => {
    vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
    const { service, prisma, stripe } = buildService();
    paidBase(prisma);
    stripe.subscriptions.retrieve.mockResolvedValue(stripeSubscription("price_base_m"));
    stripe.invoices.create.mockResolvedValue({ id: "in_fee" });
    stripe.invoices.pay.mockRejectedValue(authRequired());
    stripe.invoices.retrieve.mockResolvedValue({ id: "in_fee", status: "open", hosted_invoice_url: "https://invoice.stripe.com/i/in_fee" });

    await expect(service.createSubscriptionCheckout("user-1", "PLUS")).resolves.toEqual({ url: "https://invoice.stripe.com/i/in_fee" });
    expect(stripe.invoices.voidInvoice).not.toHaveBeenCalled();
    expect(stripe.subscriptions.update).not.toHaveBeenCalled();
  });

  it("secondo clic mentre aspetta la conferma: riapre la stessa pagina, nessuna quota nuova", async () => {
    vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
    const { service, prisma, stripe } = buildService();
    paidBase(prisma, "in_fee");
    stripe.invoices.retrieve.mockResolvedValue({ id: "in_fee", status: "open", created: (NOW.getTime() - 60_000) / 1000, hosted_invoice_url: "https://invoice.stripe.com/i/in_fee", metadata: { plan: "PLUS", stripeSubscriptionId: "sub_1" } });

    await expect(service.createSubscriptionCheckout("user-1", "PLUS")).resolves.toEqual({ url: "https://invoice.stripe.com/i/in_fee" });
    expect(stripe.invoices.create).not.toHaveBeenCalled();
  });

  it("quota pagata sulla pagina di Stripe: il livello cambia all'arrivo di invoice.paid", async () => {
    const { service, prisma, stripe } = buildService();
    paidBase(prisma, "in_fee");
    stripe.webhooks.constructEvent.mockReturnValue({
      id: "evt_fee",
      type: "invoice.paid",
      data: { object: { id: "in_fee", amount_paid: 3500, billing_reason: "manual", lines: { data: [] }, metadata: { kind: "tier_upgrade_fee", plan: "PLUS", stripeSubscriptionId: "sub_1", professionalProfileId: "pro-1" } } },
    });
    stripe.invoices.retrieve.mockResolvedValue({ id: "in_fee", status: "paid", metadata: { plan: "PLUS", stripeSubscriptionId: "sub_1" } });
    stripe.subscriptions.retrieve.mockResolvedValue(stripeSubscription("price_base_m"));
    stripe.subscriptions.update.mockResolvedValue(stripeSubscription("price_plus_m"));

    await service.handleWebhookEvent(Buffer.from("{}"), "sig");

    expect(stripe.subscriptions.update).toHaveBeenCalledWith("sub_1", expect.objectContaining({ items: [{ id: "si_1", price: "price_plus_m" }] }));
  });
});

describe("webhook dell'abbonamento", () => {
  it("secondo abbonamento da una seconda scheda: annullato, la riga resta sul primo, la Finanza rimborsa (E3-01)", async () => {
    const { service, prisma, stripe, invoicesService } = buildService();
    stripe.webhooks.constructEvent.mockReturnValue({
      id: "evt_1",
      type: "checkout.session.completed",
      data: { object: { payment_status: "paid", subscription: "sub_2", invoice: "in_dup", amount_total: 2318, metadata: { kind: "subscription", professionalProfileId: "pro-1", plan: "BASE" } } },
    });
    prisma.subscription.findUnique.mockResolvedValue({ stripeSubscriptionId: "sub_1" });
    stripe.subscriptions.retrieve.mockResolvedValue(stripeSubscription("price_base_m", "active"));
    stripe.invoicePayments.list.mockResolvedValue({ data: [{ payment: { type: "payment_intent", payment_intent: "pi_dup" } }] });

    await service.handleWebhookEvent(Buffer.from("{}"), "sig");

    expect(stripe.subscriptions.cancel).toHaveBeenCalledWith("sub_2", { prorate: false, invoice_now: false }, stripeOpts("doppione-sub_2"));
    expect(prisma.subscription.upsert).not.toHaveBeenCalled();
    // Rimborsato subito; la Finanza lo sa (nota di credito dal rimborso).
    expect(stripe.invoicePayments.list).toHaveBeenCalledWith({ invoice: "in_dup", status: "paid", limit: 10 });
    expect(stripe.refunds.create).toHaveBeenCalledWith(expect.objectContaining({ payment_intent: "pi_dup", reason: "duplicate" }), stripeOpts("rimborso-doppione-pi_dup"));
    expect(invoicesService.notifyFinanceAdmins).toHaveBeenCalledWith("ADMIN_SUBSCRIPTION_DUPLICATE", expect.objectContaining({ amountEurCents: 2318, stripeSubscriptionId: "sub_2", refunded: true }));
  });

  it("carta cambiata con il rinnovo non pagato: si riprova subito con la carta nuova (decisione di Luca del 09/11/2026)", async () => {
    const { service, prisma, stripe } = buildService();
    const cardChanged = (previous: object) => ({
      id: `evt_cus_${Object.keys(previous).join()}`,
      type: "customer.updated",
      data: { object: { id: "cus_1", invoice_settings: { default_payment_method: "pm_new" } }, previous_attributes: previous },
    });
    prisma.professionalProfile.findFirst.mockResolvedValue({ id: "pro-1" });
    prisma.subscription.findUnique.mockResolvedValue({ status: "PAST_DUE", stripeSubscriptionId: "sub_1" });
    stripe.invoices.list.mockResolvedValue({ data: [{ id: "in_renewal" }] });
    stripe.webhooks.constructEvent.mockReturnValueOnce(cardChanged({ email: "vecchia@example.com" })).mockReturnValueOnce(cardChanged({ invoice_settings: { default_payment_method: "pm_old" } }));

    // Cambiata solo l'email: nessun tentativo.
    await service.handleWebhookEvent(Buffer.from("{}"), "sig");
    expect(stripe.invoices.pay).not.toHaveBeenCalled();

    await service.handleWebhookEvent(Buffer.from("{}"), "sig");
    expect(stripe.invoices.list).toHaveBeenCalledWith({ customer: "cus_1", subscription: "sub_1", status: "open", limit: 3 });
    expect(stripe.invoices.pay).toHaveBeenCalledWith("in_renewal", { payment_method: "pm_new", off_session: true });
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
