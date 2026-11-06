import { describe, expect, it, vi } from "vitest";
import { OnlineMoneyService } from "./online-money.service";

/**
 * Rimborso partito fuori dal sito, su Stripe (Dashboard o un altro ambiente
 * con lo stesso Stripe, docs/changelog/2026-11-05-pagamenti-di-prova.md):
 * si registra sul lavoro una volta sola, i nostri rimborsi si saltano.
 */
function buildService(job: Record<string, unknown> = {}) {
  const jp = {
    id: "jp-1",
    paymentMethod: "MANOVIA",
    stripeDirectCharge: true,
    stripeDestinationAccountId: "acct_1",
    paidEurCents: 2000,
    refundedEurCents: 0,
    releasedAt: null,
    booking: { id: "bk-1", clientId: "client-1", quote: { guidedRequestId: "gr-1" } },
    ...job,
  };
  const prisma = {
    jobPayment: { findFirst: vi.fn().mockResolvedValue(jp), findUniqueOrThrow: vi.fn().mockResolvedValue(jp), update: vi.fn() },
    refund: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn() },
    user: { findMany: vi.fn().mockResolvedValue([{ id: "admin-1", adminRoles: ["FINANCE"] }]) },
    $transaction: vi.fn((ops: unknown[]) => Promise.all(ops)),
  };
  const stripe = { refunds: { list: vi.fn() } };
  const audit = { record: vi.fn() };
  const notifications = { notify: vi.fn() };
  const service = new OnlineMoneyService(prisma as never, audit as never, notifications as never);
  (service as unknown as { stripe: unknown }).stripe = stripe;
  return { service, prisma, stripe, notify: notifications.notify };
}

const charge = { id: "ch_1", payment_intent: "pi_dep" } as never;

describe("OnlineMoneyService.handleChargeRefunded", () => {
  it("registra un rimborso fatto su Stripe: lavoro rimborsato, Finanza e cliente avvisati", async () => {
    const { service, prisma, stripe, notify } = buildService();
    stripe.refunds.list.mockResolvedValue({ data: [{ id: "re_fuori", amount: 2000, status: "succeeded", metadata: { reason: "Preventivo non trovato." } }] });

    await service.handleChargeRefunded(charge, "acct_1");

    expect(stripe.refunds.list).toHaveBeenCalledWith({ charge: "ch_1", limit: 100 }, { stripeAccount: "acct_1" });
    expect(prisma.refund.create).toHaveBeenCalledWith({ data: expect.objectContaining({ jobPaymentId: "jp-1", amountEurCents: 2000, status: "PROCESSED", stripeRefundId: "re_fuori" }) });
    expect(prisma.jobPayment.update).toHaveBeenCalledWith({
      where: { id: "jp-1" },
      data: expect.objectContaining({ refundedEurCents: 2000, onlineStage: "REFUNDED", status: "REFUNDED" }),
    });
    expect(notify).toHaveBeenCalledWith("admin-1", "ADMIN_JOB_REFUND_OUTSIDE", expect.objectContaining({ amountEurCents: 2000, afterRelease: false }));
    expect(notify).toHaveBeenCalledWith("client-1", "JOB_REFUND_COMPLETED", expect.objectContaining({ bookingId: "bk-1", audience: "CLIENT" }));
  });

  it("salta i rimborsi fatti dal sito e quelli già registrati", async () => {
    const { service, prisma, stripe, notify } = buildService();
    stripe.refunds.list.mockResolvedValue({
      data: [
        { id: "re_nostro", amount: 1000, status: "succeeded", metadata: { jobPaymentId: "jp-1" } },
        { id: "re_visto", amount: 1000, status: "succeeded", metadata: {} },
      ],
    });
    prisma.refund.findFirst.mockImplementation(({ where }: { where: { stripeRefundId: string } }) => Promise.resolve(where.stripeRefundId === "re_visto" ? { id: "r-1" } : null));

    await service.handleChargeRefunded(charge, "acct_1");

    expect(prisma.refund.create).not.toHaveBeenCalled();
    expect(prisma.jobPayment.update).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });

  it("un rimborso parziale non chiude il lavoro", async () => {
    const { service, prisma, stripe } = buildService({ paidEurCents: 10000 });
    stripe.refunds.list.mockResolvedValue({ data: [{ id: "re_parte", amount: 3000, status: "succeeded", metadata: {} }] });

    await service.handleChargeRefunded(charge, "acct_1");

    expect(prisma.jobPayment.update).toHaveBeenCalledWith({ where: { id: "jp-1" }, data: { refundedEurCents: 3000 } });
  });

  it("ignora un pagamento che non è di un lavoro", async () => {
    const { service, prisma, stripe } = buildService();
    prisma.jobPayment.findFirst.mockResolvedValue(null);

    await service.handleChargeRefunded(charge, "acct_1");

    expect(stripe.refunds.list).not.toHaveBeenCalled();
  });
});
