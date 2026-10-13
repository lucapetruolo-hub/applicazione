import { describe, expect, it, vi } from "vitest";
import { BadRequestException, ConflictException } from "@nestjs/common";
import Stripe from "stripe";
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
  const jobPaymentsService = { handleManoviaCheckoutCompleted: vi.fn(), handleStripeDispute: vi.fn().mockResolvedValue(true), notifyFinanceAdmins: vi.fn() };
  const professionalFiscalService = { refreshStripeConnectStatus: vi.fn() };
  const service = new BillingService(prisma as never, jobPaymentsService as never, professionalFiscalService as never, {} as never);
  const boostEvent = {
    id: "evt_1",
    type: "checkout.session.completed",
    data: { object: { metadata: { kind: "boost", boostType: "BOOST_LOCALE", professionalProfileId: "pro-1" }, amount_total: 1990, payment_intent: "pi_1" } },
  };
  const stripe = { webhooks: { constructEvent: vi.fn().mockReturnValue(boostEvent) } };
  (service as unknown as { stripe: unknown }).stripe = stripe;
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
  delete process.env.STRIPE_CONNECT_WEBHOOK_SECRET;
  return { service, prisma, jobPaymentsService, professionalFiscalService, stripe };
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

  it("con un pagamento lento ancora in arrivo non attiva nulla, lo fa all'arrivo dei soldi", async () => {
    const { service, prisma, stripe } = buildService();
    const session = { metadata: { kind: "boost", boostType: "BOOST_LOCALE", professionalProfileId: "pro-1" }, amount_total: 1990, payment_intent: "pi_1" };
    stripe.webhooks.constructEvent.mockReturnValueOnce({ id: "evt_3", type: "checkout.session.completed", data: { object: { ...session, payment_status: "unpaid" } } });

    await service.handleWebhookEvent(Buffer.from("{}"), "sig");
    expect(prisma.visibilityBoost.create).not.toHaveBeenCalled();

    stripe.webhooks.constructEvent.mockReturnValueOnce({ id: "evt_4", type: "checkout.session.async_payment_succeeded", data: { object: { ...session, payment_status: "paid" } } });
    await service.handleWebhookEvent(Buffer.from("{}"), "sig");
    expect(prisma.visibilityBoost.create).toHaveBeenCalledTimes(1);
  });

  it("accetta anche gli eventi dell'endpoint Connect, firmati con la seconda chiave", async () => {
    const { service, stripe, professionalFiscalService } = buildService();
    process.env.STRIPE_CONNECT_WEBHOOK_SECRET = "whsec_connect";
    const accountEvent = { id: "evt_5", type: "account.updated", data: { object: { id: "acct_1" } } };
    stripe.webhooks.constructEvent.mockImplementation((_body: unknown, _sig: unknown, secret: string) => {
      if (secret !== "whsec_connect") throw new Stripe.errors.StripeSignatureVerificationError("header", "payload", { message: "firma" });
      return accountEvent;
    });

    await expect(service.handleWebhookEvent(Buffer.from("{}"), "sig")).resolves.toEqual({ received: true });
    expect(professionalFiscalService.refreshStripeConnectStatus).toHaveBeenCalledWith("acct_1");
  });

  it("risponde 400 se la firma non corrisponde a nessuna chiave", async () => {
    const { service, stripe } = buildService();
    stripe.webhooks.constructEvent.mockImplementation(() => {
      throw new Stripe.errors.StripeSignatureVerificationError("header", "payload", { message: "firma" });
    });

    await expect(service.handleWebhookEvent(Buffer.from("{}"), "sig")).rejects.toThrow(BadRequestException);
  });

  it("passa le contestazioni in banca ai pagamenti dei lavori, e avvisa il team se non è un lavoro", async () => {
    const { service, stripe, jobPaymentsService } = buildService();
    const dispute = { id: "dp_1", payment_intent: "pi_9", amount: 1990, status: "needs_response" };
    jobPaymentsService.handleStripeDispute.mockResolvedValue(false);
    stripe.webhooks.constructEvent.mockReturnValue({ id: "evt_6", type: "charge.dispute.created", data: { object: dispute } });

    await service.handleWebhookEvent(Buffer.from("{}"), "sig");

    expect(jobPaymentsService.handleStripeDispute).toHaveBeenCalledWith(dispute);
    expect(jobPaymentsService.notifyFinanceAdmins).toHaveBeenCalledWith("ADMIN_STRIPE_DISPUTE", expect.objectContaining({ amountEurCents: 1990 }));
  });
});
