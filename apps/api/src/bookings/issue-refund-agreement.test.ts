import { describe, expect, it, vi } from "vitest";
import { BookingsService } from "./bookings.service";

/** Rimborso concordato in chat su una segnalazione (collaudo F-03). */
function buildService(issue: Record<string, unknown>, jobPayment: Record<string, unknown> | null) {
  const prisma = {
    booking: {
      findUnique: vi.fn().mockResolvedValue({
        id: "bk-1",
        clientId: "client-1",
        professionalProfileId: "pro-1",
        professionalProfile: { userId: "pro-user-1" },
        quote: { guidedRequestId: "gr-1" },
        issue: { id: "is-1", type: "BAD_WORK", ...issue },
        jobPayment,
      }),
    },
    jobIssue: { update: vi.fn(), updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
  };
  const notify = vi.fn();
  const jobPaymentsService = { refundAgreed: vi.fn().mockResolvedValue(3000) };
  const service = new BookingsService(
    prisma as never,
    { notify } as never,
    {} as never,
    { log: vi.fn() } as never,
    jobPaymentsService as never,
    {} as never,
    {} as never,
  );
  return { service, prisma, notify, jobPaymentsService };
}

const onlinePaid = { id: "jp-1", paymentMethod: "MANOVIA", releasedAt: null, paidEurCents: 10000, refundedEurCents: 0 };

describe("rimborso concordato in chat (collaudo F-03)", () => {
  it("il professionista propone una cifra fino a quanto pagato online, e il cliente lo sa", async () => {
    const { service, prisma, notify } = buildService({ status: "CHAT" }, onlinePaid);

    await expect(service.offerIssueRefund("pro-user-1", "bk-1", 12000)).rejects.toThrow(/al massimo/);
    await service.offerIssueRefund("pro-user-1", "bk-1", 3000);

    expect(prisma.jobIssue.update).toHaveBeenCalledWith({ where: { id: "is-1" }, data: expect.objectContaining({ refundOfferEurCents: 3000 }) });
    expect(notify).toHaveBeenCalledWith("client-1", "JOB_ISSUE_REFUND_OFFERED", expect.objectContaining({ amountEurCents: 3000 }));
  });

  it("niente proposta con il pagamento diretto o con i soldi già sbloccati", async () => {
    for (const jp of [{ ...onlinePaid, paymentMethod: "DIRECT" }, { ...onlinePaid, releasedAt: new Date() }]) {
      const { service } = buildService({ status: "CHAT" }, jp);
      await expect(service.offerIssueRefund("pro-user-1", "bk-1", 3000)).rejects.toThrow(/pagato online/);
    }
  });

  it("il cliente accetta: il rimborso parte e la segnalazione si chiude, una volta sola", async () => {
    const { service, prisma, notify, jobPaymentsService } = buildService({ status: "CHAT", refundOfferEurCents: 3000 }, { id: "jp-1" });

    await expect(service.acceptIssueRefund("client-1", "bk-1")).resolves.toMatchObject({ status: "RESOLVED", agreedRefundEurCents: 3000 });
    expect(prisma.jobIssue.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "is-1", status: "CHAT", refundOfferEurCents: 3000 } }));
    expect(jobPaymentsService.refundAgreed).toHaveBeenCalledWith("jp-1", 3000, "client-1");
    expect(notify).toHaveBeenCalledWith("pro-user-1", "JOB_ISSUE_SETTLED", expect.objectContaining({ agreedRefundEurCents: 3000 }));

    prisma.jobIssue.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(service.acceptIssueRefund("client-1", "bk-1")).rejects.toThrow(/ricarica/);
    expect(jobPaymentsService.refundAgreed).toHaveBeenCalledTimes(1);
  });

  it("se Stripe non risponde la proposta resta valida", async () => {
    const { service, prisma, jobPaymentsService } = buildService({ status: "CHAT", refundOfferEurCents: 3000 }, { id: "jp-1" });
    jobPaymentsService.refundAgreed.mockRejectedValueOnce(new Error("Stripe giù"));

    await expect(service.acceptIssueRefund("client-1", "bk-1")).rejects.toThrow(/non è partito/);
    expect(prisma.jobIssue.update).toHaveBeenCalledWith({ where: { id: "is-1" }, data: expect.objectContaining({ status: "CHAT", refundOfferEurCents: 3000 }) });
  });
});
