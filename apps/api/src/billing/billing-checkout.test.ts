import { afterEach, describe, expect, it, vi } from "vitest";
import { BillingService } from "./billing.service";

/**
 * Scelta del livello nel periodo gratuito
 * (docs/changelog/2026-10-29-offerta-mesi-gratis.md): prima del lancio (anche
 * senza LAUNCH_DATE) non parte nessuna quota, come dice la pagina Abbonamento.
 */
function buildService() {
  const profile = { id: "pro-1", businessName: "Idraulica Rossi", stripeCustomerId: "cus_1", user: { email: "pro@example.com" } };
  const prisma = {
    professionalProfile: { findUnique: vi.fn().mockResolvedValue(profile) },
    subscription: {
      findUnique: vi.fn().mockResolvedValue({ status: "TRIALING", plan: "FREE", stripeSubscriptionId: null, trialEndsAt: new Date("2027-01-27T10:00:00Z"), founderNumber: 4 }),
    },
  };
  const stripe = { checkout: { sessions: { create: vi.fn().mockResolvedValue({ url: "https://checkout.stripe.com/s" }) } } };
  const subscriptionsService = {};
  const service = new BillingService(prisma as never, {} as never, {} as never, {} as never, subscriptionsService as never, {} as never);
  (service as unknown as { stripe: unknown }).stripe = stripe;
  return { service, stripe };
}

afterEach(() => {
  vi.useRealTimers();
  delete process.env.LAUNCH_DATE;
  delete process.env.STRIPE_PRICE_PLUS_ANNUAL;
  delete process.env.STRIPE_TAX_RATE_IVA;
});

describe("BillingService.createSubscriptionCheckout nel periodo gratuito", () => {
  it("senza LAUNCH_DATE nessuna quota di passaggio: il primo addebito resta alla fine dei giorni gratuiti", async () => {
    vi.useFakeTimers({ now: new Date("2026-10-29T10:00:00Z"), toFake: ["Date"] });
    process.env.STRIPE_PRICE_PLUS_ANNUAL = "price_plus_y";
    process.env.STRIPE_TAX_RATE_IVA = "txr_1";
    const { service, stripe } = buildService();

    await service.createSubscriptionCheckout("user-1", "PLUS", "YEAR");

    const params = stripe.checkout.sessions.create.mock.calls[0]![0];
    expect(params.line_items).toHaveLength(1);
    expect(params.subscription_data.trial_end).toBe(Math.floor(new Date("2027-01-27T10:00:00Z").getTime() / 1000));
  });
});
