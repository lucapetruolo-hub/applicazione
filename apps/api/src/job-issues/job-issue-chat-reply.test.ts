import { describe, expect, it, vi } from "vitest";
import { JobIssueOutcomeService } from "./job-issue-outcome.service";

/** Collaudo F-20: un evento scritto dal sito non vale come risposta del professionista in chat. */
describe("risposta del professionista in chat", () => {
  it("conta solo i messaggi scritti da lui, mai gli eventi automatici", async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const prisma = { conversationEvent: { findFirst } };
    const service = new JobIssueOutcomeService(prisma as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never);
    const createdAt = new Date("2026-10-29T10:00:00Z");

    const out = await service.proChatReplies([
      { id: "is-1", createdAt, professionalRespondedAt: null, guidedRequestId: "gr-1", professionalProfileId: "pro-1" },
    ]);

    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ actor: "PROFESSIONAL", automatic: false, createdAt: { gt: createdAt } }) }),
    );
    expect(out.get("is-1")).toBeNull();
  });
});
