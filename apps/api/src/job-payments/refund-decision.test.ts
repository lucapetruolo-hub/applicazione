import { describe, expect, it, vi } from "vitest";
import { BadRequestException } from "@nestjs/common";
import { RefundsService } from "./refunds.service";

/**
 * Decisione admin su un rimborso (collaudo 29/10, riordino admin): un rifiuto
 * ha sempre il motivo, detto a chi l'aveva chiesto; se Stripe sbaglia dopo
 * "Approva" il rimborso torna da decidere.
 */
function build(refundOnline = vi.fn().mockResolvedValue(undefined)) {
  const refund = {
    id: "rf-1",
    status: "REQUESTED",
    amountEurCents: 5000,
    reason: null,
    requestedById: "client-1",
    jobPaymentId: "jp-1",
    jobPayment: { paymentMethod: "MANOVIA", bookingId: "bk-1", booking: { id: "bk-1", clientId: "client-1", quote: { guidedRequestId: "gr-1" } } },
  };
  const prisma = {
    refund: {
      findUnique: vi.fn().mockResolvedValue(refund),
      update: vi.fn().mockImplementation(({ data }) => Promise.resolve({ ...refund, ...data })),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    jobIssue: { findUnique: vi.fn().mockResolvedValue(null) },
    jobPayment: { update: vi.fn() },
  };
  const notify = vi.fn();
  const service = new RefundsService(prisma as never, { record: vi.fn() } as never, { refundOnline } as never, { notify } as never);
  return { service, prisma, notify, refundOnline };
}

describe("decisione admin su un rimborso", () => {
  it("rifiuto senza motivo: non si salva", async () => {
    const { service, prisma } = build();
    await expect(service.decide("rf-1", "REJECTED", "admin-1", "  ")).rejects.toThrow(BadRequestException);
    expect(prisma.refund.update).not.toHaveBeenCalled();
  });

  it("rifiuto con motivo: chi l'ha chiesto lo riceve", async () => {
    const { service, notify } = build();
    await service.decide("rf-1", "REJECTED", "admin-1", "Lavoro fatto come da preventivo.");
    expect(notify).toHaveBeenCalledWith("client-1", "JOB_REFUND_REJECTED", expect.objectContaining({ note: "Lavoro fatto come da preventivo.", audience: "CLIENT", amountEurCents: 5000 }));
  });

  it("Stripe sbaglia dopo Approva: torna da decidere", async () => {
    const { service, prisma } = build(vi.fn().mockRejectedValue(new Error("Stripe giù")));
    await expect(service.decide("rf-1", "APPROVED", "admin-1")).rejects.toThrow(/resta da decidere/);
    expect(prisma.refund.update).toHaveBeenCalledWith({ where: { id: "rf-1" }, data: { status: "REQUESTED" } });
  });

  it("due Approva insieme: rimborsa una volta sola", async () => {
    const { service, prisma, refundOnline } = build();
    prisma.refund.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.decide("rf-1", "APPROVED", "admin-1")).rejects.toThrow(/già stato deciso/);
    expect(refundOnline).not.toHaveBeenCalled();
  });
});
