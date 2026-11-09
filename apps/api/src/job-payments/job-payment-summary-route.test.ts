import { describe, expect, it, vi } from "vitest";
import { ForbiddenException } from "@nestjs/common";
import { JobPaymentsService } from "./job-payments.service";

// GET /bookings/:id/job-payment (collaudo 08/11, E3-04): il riepilogo delle
// schede, mai la riga intera con gli id Stripe e la difesa della contestazione.

const row = {
  paymentMethod: "MANOVIA",
  balanceDirect: false,
  onlineStage: "DEPOSIT_PAID",
  depositEurCents: 6000,
  paidEurCents: 6000,
  refundedEurCents: 0,
  platformFeeEurCents: 0,
  stripeFeeEurCents: 0,
  netAmountEurCents: 0,
  releaseDueAt: null,
  releasedAt: null,
  balanceUnpaidAt: null,
  stripeDestinationAccountId: "acct_pro",
  clientStripeCustomerId: "cus_cliente",
  savedPaymentMethodId: "pm_cliente",
  stripeDisputeId: "dp_1",
  stripeDisputeStatus: "needs_response",
  disputeProNote: "Il lavoro è stato fatto, ecco le foto.",
  disputeProPhotoUrls: ["https://esempio/foto.jpg"],
  disputeEvidence: { note: "prove" },
};

function setup() {
  const prisma = {
    booking: {
      findUnique: vi.fn(async () => ({ clientId: "c1", finalAmountEurCents: null, professionalProfile: { userId: "pro1" }, jobPayment: row })),
    },
  };
  return new JobPaymentsService(prisma as never, {} as never, {} as never, {} as never);
}

describe("Pagamento del lavoro letto dall'API", () => {
  it("al cliente niente id Stripe né difesa del professionista", async () => {
    const summary = await setup().getForBooking("c1", "b1");
    const text = JSON.stringify(summary);
    expect(summary).toEqual(expect.objectContaining({ method: "ONLINE", depositEurCents: 6000, paidEurCents: 6000 }));
    for (const secret of ["acct_pro", "cus_cliente", "pm_cliente", "ecco le foto", "prove", "dp_1"]) expect(text).not.toContain(secret);
    expect(summary).not.toHaveProperty("bankDispute");
  });

  it("al professionista il suo riepilogo, con la sua contestazione", async () => {
    const summary = await setup().getForBooking("pro1", "b1");
    expect(summary?.bankDispute).toEqual(expect.objectContaining({ open: true }));
    expect(JSON.stringify(summary)).not.toContain("cus_cliente");
    expect(JSON.stringify(summary)).not.toContain("pm_cliente");
  });

  it("nessun altro lo legge", async () => {
    await expect(setup().getForBooking("estraneo", "b1")).rejects.toBeInstanceOf(ForbiddenException);
  });
});
