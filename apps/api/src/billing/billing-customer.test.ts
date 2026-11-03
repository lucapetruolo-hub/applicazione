import { describe, expect, it, vi } from "vitest";
import { BillingService } from "./billing.service";
import { statementSuffix } from "../job-payments/online-money.service";

/**
 * Un solo cliente Stripe per professionista (docs/CHANGELOG.md §238):
 * creato una volta, riusato per abbonamento, boost e Customer Portal.
 */
async function* asyncList<T>(items: T[]): AsyncGenerator<T> {
  for (const item of items) yield item;
}

function buildService(profileOverrides: Record<string, unknown> = {}) {
  const profile = { id: "pro-1", businessName: "Idraulica Rossi", stripeCustomerId: null, user: { email: "pro@example.com" }, ...profileOverrides };
  const prisma = {
    professionalProfile: { findUnique: vi.fn().mockResolvedValue(profile), updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    subscription: { findUnique: vi.fn().mockResolvedValue(null) },
  };
  const stripe = {
    customers: { create: vi.fn().mockResolvedValue({ id: "cus_new" }) },
    subscriptions: { retrieve: vi.fn() },
    billingPortal: {
      sessions: { create: vi.fn().mockResolvedValue({ url: "https://billing.stripe.com/p/session" }) },
      configurations: { list: vi.fn().mockReturnValue(asyncList([])), create: vi.fn().mockResolvedValue({ id: "bpc_solo_carta" }) },
    },
  };
  const service = new BillingService(prisma as never, {} as never, {} as never, {} as never, {} as never, {} as never);
  (service as unknown as { stripe: unknown }).stripe = stripe;
  return { service, prisma, stripe };
}

describe("BillingService.createBillingPortal", () => {
  it("crea il cliente la prima volta, con chiave di idempotenza, e lo salva", async () => {
    const { service, prisma, stripe } = buildService();

    await expect(service.createBillingPortal("user-1")).resolves.toEqual({ url: "https://billing.stripe.com/p/session" });

    expect(stripe.customers.create).toHaveBeenCalledWith(expect.objectContaining({ email: "pro@example.com" }), { idempotencyKey: "professional-customer-pro-1" });
    expect(prisma.professionalProfile.updateMany).toHaveBeenCalledWith({ where: { id: "pro-1", stripeCustomerId: null }, data: { stripeCustomerId: "cus_new" } });
    expect(stripe.billingPortal.sessions.create).toHaveBeenCalledWith(expect.objectContaining({ customer: "cus_new" }));
  });

  it("riusa il cliente già salvato", async () => {
    const { service, stripe } = buildService({ stripeCustomerId: "cus_saved" });

    await service.createBillingPortal("user-1");

    expect(stripe.customers.create).not.toHaveBeenCalled();
    expect(stripe.billingPortal.sessions.create).toHaveBeenCalledWith(expect.objectContaining({ customer: "cus_saved" }));
  });

  it("chi aveva già un abbonamento riprende il cliente di quell'abbonamento", async () => {
    const { service, prisma, stripe } = buildService();
    prisma.subscription.findUnique.mockResolvedValue({ stripeSubscriptionId: "sub_1" });
    stripe.subscriptions.retrieve.mockResolvedValue({ customer: "cus_old" });

    await service.createBillingPortal("user-1");

    expect(stripe.customers.create).not.toHaveBeenCalled();
    expect(prisma.professionalProfile.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { stripeCustomerId: "cus_old" } }));
  });
});

describe("Customer Portal solo per la carta (collaudo G-02)", () => {
  it("crea la configurazione senza storico delle fatture e la riusa", async () => {
    const { service, stripe } = buildService({ stripeCustomerId: "cus_saved" });

    await service.createBillingPortal("user-1");
    await service.createBillingPortal("user-1");

    expect(stripe.billingPortal.configurations.create).toHaveBeenCalledTimes(1);
    expect(stripe.billingPortal.configurations.create).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: { uso: "solo-carta-v1" },
        features: expect.objectContaining({ invoice_history: { enabled: false }, payment_method_update: { enabled: true } }),
      }),
      expect.anything(),
    );
    expect(stripe.billingPortal.sessions.create).toHaveBeenCalledWith(expect.objectContaining({ configuration: "bpc_solo_carta" }));
  });

  it("ritrova la configurazione già creata su Stripe", async () => {
    const { service, stripe } = buildService({ stripeCustomerId: "cus_saved" });
    stripe.billingPortal.configurations.list.mockReturnValue(asyncList([{ id: "bpc_altra", metadata: {} }, { id: "bpc_vecchia", metadata: { uso: "solo-carta-v1" } }]));

    await service.createBillingPortal("user-1");

    expect(stripe.billingPortal.configurations.create).not.toHaveBeenCalled();
    expect(stripe.billingPortal.sessions.create).toHaveBeenCalledWith(expect.objectContaining({ configuration: "bpc_vecchia" }));
  });
});

describe("statementSuffix", () => {
  it("toglie accenti e caratteri vietati e resta entro 10 caratteri", () => {
    expect(statementSuffix("Pulizìe \"Bianchi\" & figli")).toBe("PULIZIE BI");
    expect(statementSuffix("Elettrica")).toBe("ELETTRICA");
  });

  it("nessun suffisso senza lettere", () => {
    expect(statementSuffix("123 ***")).toBeNull();
  });
});
