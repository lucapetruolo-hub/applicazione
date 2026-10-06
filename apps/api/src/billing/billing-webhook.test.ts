import { describe, expect, it, vi } from "vitest";
import { ConflictException } from "@nestjs/common";
import { BillingService } from "./billing.service";

/**
 * Webhook Stripe (docs/CHANGELOG.md §170): Stripe ripete un evento quando
 * non riceve risposta in tempo. Ogni evento deve produrre i suoi effetti
 * una volta sola, e un evento fallito deve poter essere rifatto.
 */
function buildService() {
  const prisma = {
    stripeWebhookEvent: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn(), delete: vi.fn().mockResolvedValue({}) },
    payment: { create: vi.fn() },
    visibilityBoost: { create: vi.fn() },
  };
  const jobPaymentsService = { handleManoviaCheckoutCompleted: vi.fn() };
  const service = new BillingService(prisma as never, jobPaymentsService as never, {} as never, {} as never);
  const boostEvent = {
    id: "evt_1",
    type: "checkout.session.completed",
    data: { object: { metadata: { kind: "boost", boostType: "BOOST_LOCALE", professionalProfileId: "pro-1" }, amount_total: 1990, payment_intent: "pi_1" } },
  };
  const stripe = { webhooks: { constructEvent: vi.fn().mockReturnValue(boostEvent) } };
  (service as unknown as { stripe: unknown }).stripe = stripe;
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
  return { service, prisma, jobPaymentsService, stripe };
}

const duplicateKey = Object.assign(new Error("Unique constraint failed"), { code: "P2002" });

describe("BillingService.handleWebhookEvent", () => {
  it("applica un evento nuovo e lo segna come elaborato", async () => {
    const { service, prisma } = buildService();

    await expect(service.handleWebhookEvent(Buffer.from("{}"), "sig")).resolves.toEqual({ received: true });

    expect(prisma.stripeWebhookEvent.create).toHaveBeenCalledWith({ data: { id: "evt_1", type: "checkout.session.completed" } });
    expect(prisma.visibilityBoost.create).toHaveBeenCalledTimes(1);
    expect(prisma.payment.create).toHaveBeenCalledTimes(1);
    expect(prisma.stripeWebhookEvent.update).toHaveBeenCalledWith({ where: { id: "evt_1" }, data: { processedAt: expect.any(Date) } });
  });

  it("non rifà nulla su un evento già elaborato", async () => {
    const { service, prisma } = buildService();
    prisma.stripeWebhookEvent.create.mockRejectedValue(duplicateKey);
    prisma.stripeWebhookEvent.findUnique.mockResolvedValue({ id: "evt_1", processedAt: new Date() });

    await expect(service.handleWebhookEvent(Buffer.from("{}"), "sig")).resolves.toEqual({ received: true, duplicate: true });

    expect(prisma.payment.create).not.toHaveBeenCalled();
    expect(prisma.visibilityBoost.create).not.toHaveBeenCalled();
  });

  it("chiede a Stripe di riprovare se lo stesso evento è ancora in lavorazione", async () => {
    const { service, prisma } = buildService();
    prisma.stripeWebhookEvent.create.mockRejectedValue(duplicateKey);
    prisma.stripeWebhookEvent.findUnique.mockResolvedValue({ id: "evt_1", processedAt: null });

    await expect(service.handleWebhookEvent(Buffer.from("{}"), "sig")).rejects.toThrow(ConflictException);
    expect(prisma.payment.create).not.toHaveBeenCalled();
  });

  it("se l'elaborazione fallisce, libera l'evento per il nuovo tentativo di Stripe", async () => {
    const { service, prisma } = buildService();
    prisma.payment.create.mockRejectedValue(new Error("database non raggiungibile"));

    await expect(service.handleWebhookEvent(Buffer.from("{}"), "sig")).rejects.toThrow("database non raggiungibile");

    expect(prisma.stripeWebhookEvent.delete).toHaveBeenCalledWith({ where: { id: "evt_1" } });
    expect(prisma.stripeWebhookEvent.update).not.toHaveBeenCalled();
  });

  it("passa i pagamenti dei lavori al servizio dei pagamenti online", async () => {
    const { service, stripe, jobPaymentsService } = buildService();
    const session = { metadata: { kind: "job_payment", jobPaymentId: "jp-1", part: "deposit" }, payment_intent: "pi_2", amount_total: 8000 };
    stripe.webhooks.constructEvent.mockReturnValue({ id: "evt_2", type: "checkout.session.completed", data: { object: session } });

    await service.handleWebhookEvent(Buffer.from("{}"), "sig");

    expect(jobPaymentsService.handleManoviaCheckoutCompleted).toHaveBeenCalledWith(session);
  });
});
