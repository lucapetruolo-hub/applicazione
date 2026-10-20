import { describe, expect, it, vi } from "vitest";
import { jobIssueRefundPercent } from "@professionisti/shared";
import { JobIssueOutcomeService } from "./job-issue-outcome.service";

/** Rimborso a livelli delle segnalazioni accolte (docs/CHANGELOG.md §267). */
function buildService(type: "BAD_WORK" | "NO_SHOW") {
  const issue = {
    id: "is-1",
    type,
    booking: {
      id: "bk-1",
      clientId: "client-1",
      status: "COMPLETED",
      professionalProfileId: "pro-1",
      professionalProfile: { userId: "pro-user-1", demotedUntil: null, requestsBlockedUntil: null },
      quote: { guidedRequestId: "gr-1" },
      jobPayment: { id: "jp-1", paymentMethod: "MANOVIA", status: "PENDING", grossAmountEurCents: 10000 },
    },
  };
  const prisma = {
    jobIssue: { findUnique: vi.fn().mockResolvedValue(issue), updateMany: vi.fn().mockResolvedValue({ count: 1 }), count: vi.fn().mockResolvedValue(1), update: vi.fn() },
    jobPayment: { findUniqueOrThrow: vi.fn().mockResolvedValue({ id: "jp-1", paidEurCents: 10000, refundedEurCents: 0 }) },
    professionalProfile: { update: vi.fn() },
    refund: { findFirst: vi.fn(), create: vi.fn().mockResolvedValue({ id: "rf-1" }) },
  };
  const onlineMoneyService = { refundOnline: vi.fn().mockResolvedValue(0), releaseIfDue: vi.fn().mockResolvedValue(true) };
  const service = new JobIssueOutcomeService(
    prisma as never,
    { notify: vi.fn() } as never,
    { recordNoShowConfirmed: vi.fn() } as never,
    { record: vi.fn() } as never,
    {} as never,
    {} as never,
    onlineMoneyService as never,
  );
  return { service, prisma, onlineMoneyService };
}

describe("rimborso a livelli (§267)", () => {
  it("la mancata presentazione rimborsa sempre tutto; per gli altri vale la scelta, 100% se manca", () => {
    expect(jobIssueRefundPercent("NO_SHOW", 20)).toBe(100);
    expect(jobIssueRefundPercent("BAD_WORK", 50)).toBe(50);
    expect(jobIssueRefundPercent("BAD_WORK", null)).toBe(100);
    expect(jobIssueRefundPercent("BAD_WORK", 30)).toBe(100);
  });

  it("rimborsa la percentuale scelta per colpa del professionista e sblocca il resto", async () => {
    const { service, prisma, onlineMoneyService } = buildService("BAD_WORK");

    await service.decide("is-1", { decision: "UPHELD", note: "Difetti seri.", byUserId: "admin-1", refundPercent: 50 });

    expect(prisma.jobIssue.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ refundPercent: 50 }) }));
    expect(onlineMoneyService.refundOnline).toHaveBeenCalledWith("jp-1", 5000, expect.stringContaining("50%"), null, { professionalFault: true });
    expect(onlineMoneyService.releaseIfDue).toHaveBeenCalledWith("jp-1");
  });

  it("la decisione automatica rimborsa tutto anche se arrivasse una percentuale", async () => {
    const { service, onlineMoneyService } = buildService("BAD_WORK");

    await service.decide("is-1", { decision: "UPHELD", note: "Nessuna risposta.", byUserId: null, autoDecision: "NO_EVIDENCE" as never, refundPercent: 20 });

    expect(onlineMoneyService.refundOnline).toHaveBeenCalledWith("jp-1", "ALL", expect.any(String), null, { professionalFault: true });
    expect(onlineMoneyService.releaseIfDue).not.toHaveBeenCalled();
  });

  it("se Stripe non risponde la Finanza riceve la richiesta della sola percentuale", async () => {
    const { service, prisma, onlineMoneyService } = buildService("BAD_WORK");
    onlineMoneyService.refundOnline.mockRejectedValue(new Error("Stripe non risponde"));

    await service.decide("is-1", { decision: "UPHELD", note: "Difetti piccoli.", byUserId: "admin-1", refundPercent: 20 });

    expect(prisma.refund.create).toHaveBeenCalledWith({ data: expect.objectContaining({ jobPaymentId: "jp-1", amountEurCents: 2000 }) });
  });
});
