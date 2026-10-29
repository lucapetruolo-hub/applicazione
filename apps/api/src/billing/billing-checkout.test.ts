import { afterEach, describe, expect, it, vi } from "vitest";
import { BillingService } from "./billing.service";

/**
 * Mesi gratis con la carta e passaggi di livello
 * (docs/changelog/2026-10-29-offerta-mesi-gratis.md): solo mensile, prima
 * del lancio (anche senza LAUNCH_DATE) nessun addebito, Plus e Pro nei mesi
 * gratis al prezzo meno il mese Base.
 */
const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-12-10T10:00:00Z");

function buildService(subscription: Record<string, unknown>) {
  const profile = { id: "pro-1", businessName: "Idraulica Rossi", stripeCustomerId: "cus_1", user: { email: "pro@example.com" } };
  const prisma = {
    professionalProfile: { findUnique: vi.fn().mockResolvedValue(profile) },
    subscription: { findUnique: vi.fn().mockResolvedValue(subscription) },
  };
  const stripe = {
    checkout: { sessions: { create: vi.fn().mockResolvedValue({ url: "https://checkout.stripe.com/s" }) } },
    coupons: { retrieve: vi.fn().mockResolvedValue({ id: "mese-base-gratis-1900" }), create: vi.fn() },
  };
  const service = new BillingService(prisma as never, {} as never, {} as never, {} as never, {} as never, {} as never);
  (service as unknown as { stripe: unknown }).stripe = stripe;
  return { service, stripe };
}

const trialing = (trialEndsAt: Date) => ({ status: "TRIALING", plan: "FREE", stripeSubscriptionId: null, trialEndsAt, freeMonthsGranted: 3, freeMonthsWaiting: 0 });

afterEach(() => {
  vi.useRealTimers();
  delete process.env.LAUNCH_DATE;
  delete process.env.STRIPE_PRICE_BASE;
  delete process.env.STRIPE_PRICE_PLUS;
  delete process.env.STRIPE_TAX_RATE_IVA;
});

function setup() {
  process.env.STRIPE_PRICE_BASE = "price_base_m";
  process.env.STRIPE_PRICE_PLUS = "price_plus_m";
  process.env.STRIPE_TAX_RATE_IVA = "txr_1";
}

describe("BillingService.createSubscriptionCheckout e mesi gratis", () => {
  it("senza LAUNCH_DATE nessun addebito: niente Plus e niente carta finché la data non è fissata", async () => {
    vi.useFakeTimers({ now: new Date("2026-10-29T10:00:00Z"), toFake: ["Date"] });
    setup();
    const { service, stripe } = buildService(trialing(new Date("2027-01-27T10:00:00Z")));

    await expect(service.createSubscriptionCheckout("user-1", "PLUS")).rejects.toThrow("dal giorno del lancio");
    await expect(service.createSubscriptionCheckout("user-1", "BASE")).rejects.toThrow("data del lancio");
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it("prima del lancio la carta per Base: il primo canone dopo i 3 mesi dal lancio, mensile", async () => {
    vi.useFakeTimers({ now: new Date("2026-10-29T10:00:00Z"), toFake: ["Date"] });
    process.env.LAUNCH_DATE = "2026-11-02";
    setup();
    const { service, stripe } = buildService(trialing(new Date("2027-01-30T23:00:00Z")));

    await service.createSubscriptionCheckout("user-1", "BASE");

    const params = stripe.checkout.sessions.create.mock.calls[0]![0];
    expect(params.line_items).toEqual([{ price: "price_base_m", quantity: 1 }]);
    expect(params.discounts).toBeUndefined();
    expect(params.subscription_data.trial_end).toBe(Math.floor(new Date("2027-01-30T23:00:00Z").getTime() / 1000));
    expect(params.metadata.interval).toBe("MONTH");
  });

  it("dopo il lancio, Plus nei mesi gratis senza carta: subito, meno il mese Base", async () => {
    vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
    process.env.LAUNCH_DATE = "2026-11-02";
    setup();
    const { service, stripe } = buildService(trialing(new Date(NOW.getTime() + 50 * DAY)));

    await service.createSubscriptionCheckout("user-1", "PLUS");

    const params = stripe.checkout.sessions.create.mock.calls[0]![0];
    expect(params.line_items).toEqual([{ price: "price_plus_m", quantity: 1 }]);
    expect(params.discounts).toEqual([{ coupon: "mese-base-gratis-1900" }]);
    expect(params.subscription_data.trial_end).toBeUndefined();
  });

  it("abbonamento concluso con 2 mesi in attesa: Base riparte con 2 mesi gratis da oggi", async () => {
    vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
    process.env.LAUNCH_DATE = "2026-11-02";
    setup();
    const { service, stripe } = buildService({ status: "CANCELED", plan: "PLUS", stripeSubscriptionId: "sub_old", trialEndsAt: new Date("2026-11-20T10:00:00Z"), freeMonthsGranted: 3, freeMonthsWaiting: 2 });

    await service.createSubscriptionCheckout("user-1", "BASE");

    const params = stripe.checkout.sessions.create.mock.calls[0]![0];
    expect(params.subscription_data.trial_end).toBe(Math.floor((NOW.getTime() + 60 * DAY) / 1000));
    expect(params.discounts).toBeUndefined();
  });
});
