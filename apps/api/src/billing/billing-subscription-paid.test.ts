import { describe, expect, it, vi } from "vitest";
import { BillingService, checkoutMessage } from "./billing.service";

/**
 * Collaudo del 29/10/2026, gruppo 9: dopo un pagamento dell'abbonamento la
 * campanella non diceva nulla (E-13) e la fattura non c'era (D-02, E-02).
 */
async function* asyncList<T>(items: T[]): AsyncGenerator<T> {
  for (const item of items) yield item;
}

function buildService(event: unknown) {
  const prisma = {
    stripeWebhookEvent: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn(), delete: vi.fn() },
    payment: { create: vi.fn() },
    subscription: { findUnique: vi.fn().mockResolvedValue({ professionalProfileId: "pro-1" }) },
    professionalProfile: { findFirst: vi.fn().mockResolvedValue(null) },
    invoice: { findUnique: vi.fn().mockResolvedValue(null) },
  };
  const subscriptionsService = { onInvoice: vi.fn(), notifyPaid: vi.fn(), applyStripeSubscription: vi.fn() };
  const invoicesService = { issueForStripeInvoice: vi.fn().mockResolvedValue(true) };
  const service = new BillingService(prisma as never, {} as never, {} as never, {} as never, subscriptionsService as never, invoicesService as never);
  const stripe = { webhooks: { constructEvent: vi.fn().mockReturnValue(event) }, invoices: { list: vi.fn() } };
  (service as unknown as { stripe: unknown }).stripe = stripe;
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
  delete process.env.STRIPE_CONNECT_WEBHOOK_SECRET;
  return { service, prisma, subscriptionsService, invoicesService, stripe };
}

function invoiceEvent(invoice: Record<string, unknown>) {
  return { id: `evt_${Math.random()}`, type: "invoice.paid", data: { object: { id: "in_1", lines: { data: [] }, ...invoice } } };
}

describe("avviso del pagamento dell'abbonamento (E-13)", () => {
  it("quota di passaggio pagata: avviso con il livello e la fattura già pronta", async () => {
    const { service, subscriptionsService } = buildService(
      invoiceEvent({ amount_paid: 17319, billing_reason: "manual", metadata: { kind: "tier_upgrade_fee", professionalProfileId: "pro-1", plan: "PLUS" } }),
    );

    await service.handleWebhookEvent(Buffer.from("{}"), "sig");

    expect(subscriptionsService.notifyPaid).toHaveBeenCalledWith(
      "pro-1",
      expect.objectContaining({ tier: "PLUS", upgradeFee: true, amountEurCents: 17319, invoiceIssued: true, card: null }),
    );
  });

  it("rinnovo: niente avviso in più, il rinnovo sa se la fattura c'è", async () => {
    const { service, subscriptionsService } = buildService(
      invoiceEvent({ amount_paid: 2318, billing_reason: "subscription_cycle", metadata: {}, parent: { subscription_details: { subscription: "sub_1" } } }),
    );

    await service.handleWebhookEvent(Buffer.from("{}"), "sig");

    expect(subscriptionsService.notifyPaid).not.toHaveBeenCalled();
    expect(subscriptionsService.onInvoice).toHaveBeenCalledWith("sub_1", expect.objectContaining({ renewal: true, invoiceIssued: true }));
  });

  it("carta data a 0 €: nessun avviso di pagamento", async () => {
    const { service, subscriptionsService } = buildService(
      invoiceEvent({ amount_paid: 0, billing_reason: "subscription_create", metadata: {}, parent: { subscription_details: { subscription: "sub_1" } } }),
    );

    await service.handleWebhookEvent(Buffer.from("{}"), "sig");

    expect(subscriptionsService.notifyPaid).not.toHaveBeenCalled();
  });
});

describe("recupero delle fatture mancate (D-02, E-02)", () => {
  it("fa la fattura solo ai pagamenti che non l'hanno", async () => {
    const { service, prisma, invoicesService, stripe } = buildService(null);
    stripe.invoices.list.mockReturnValue(asyncList([{ id: "in_fatta", amount_paid: 2318 }, { id: "in_mancante", amount_paid: 2318 }, { id: "in_zero", amount_paid: 0 }]));
    prisma.invoice.findUnique.mockImplementation(({ where }: { where: { dedupeKey: string } }) => Promise.resolve(where.dedupeKey === "STRIPE:in_fatta" ? { id: "f1" } : null));

    await expect(service.issueMissedInvoices(new Date("2026-11-20T06:15:00Z"))).resolves.toBe(1);

    expect(invoicesService.issueForStripeInvoice).toHaveBeenCalledTimes(1);
    expect(invoicesService.issueForStripeInvoice).toHaveBeenCalledWith(expect.objectContaining({ id: "in_mancante" }), expect.any(Function), { alertSkipped: false });
    // Solo gli ultimi 12 giorni: la fattura immediata va fatta entro 12 giorni dal pagamento.
    expect(stripe.invoices.list).toHaveBeenCalledWith(expect.objectContaining({ status: "paid", created: { gte: Math.floor(new Date("2026-11-08T06:15:00Z").getTime() / 1000) } }));
  });
});

describe("riga sotto il pulsante di Stripe (D-05, E-08)", () => {
  it("mesi gratis: data di fine, prezzo dopo e dov'è la fattura", () => {
    expect(checkoutMessage(new Date("2027-01-27T11:00:00Z"), "BASE")).toBe(
      "Oggi non paghi nulla: è gratis fino al 27 gennaio 2027. Poi Base a 19 € + IVA al mese, in automatico; ti avvisiamo una settimana prima e annulli quando vuoi dal sito. La fattura te la facciamo noi: la trovi nel sito, in Fatture e documenti.",
    );
  });

  it("pagamento subito: solo dov'è la fattura", () => {
    expect(checkoutMessage(null, "PLUS")).toBe("La fattura te la facciamo noi: la trovi nel sito, in Fatture e documenti.");
  });
});
