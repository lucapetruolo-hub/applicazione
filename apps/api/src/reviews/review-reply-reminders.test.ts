import { describe, expect, it, vi } from "vitest";
import { ReviewReplyRemindersService, reviewReplyReminderDue } from "./review-reply-reminders.service";

/**
 * Promemoria per le recensioni da 1-2 stelle senza risposta dopo 3 giorni
 * (decisione di Luca del 30/10/2026, docs/changelog/2026-10-30-collaudo-soldi-online.md).
 */
const now = new Date("2026-11-10T09:00:00Z");
const daysAgo = (days: number) => new Date(now.getTime() - days * 24 * 60 * 60_000);
const base = { rating: 1, professionalReply: null, hiddenAt: null, replyReminderSentAt: null, createdAt: daysAgo(4), updatedAfterIssueAt: null };

describe("quando parte il promemoria", () => {
  it("per 1 o 2 stelle senza risposta dopo 3 giorni", () => {
    expect(reviewReplyReminderDue(base, now)).toBe(true);
    expect(reviewReplyReminderDue({ ...base, rating: 2 }, now)).toBe(true);
  });

  it("mai per 3 stelle o più, prima dei 3 giorni o dopo un mese", () => {
    expect(reviewReplyReminderDue({ ...base, rating: 3 }, now)).toBe(false);
    expect(reviewReplyReminderDue({ ...base, createdAt: daysAgo(2) }, now)).toBe(false);
    expect(reviewReplyReminderDue({ ...base, createdAt: daysAgo(40) }, now)).toBe(false);
  });

  it("mai con una risposta, una recensione nascosta o un promemoria già mandato", () => {
    expect(reviewReplyReminderDue({ ...base, professionalReply: "Grazie" }, now)).toBe(false);
    expect(reviewReplyReminderDue({ ...base, hiddenAt: daysAgo(1) }, now)).toBe(false);
    expect(reviewReplyReminderDue({ ...base, replyReminderSentAt: daysAgo(1) }, now)).toBe(false);
  });

  it("per una recensione aggiornata conta dalla data dell'aggiornamento", () => {
    expect(reviewReplyReminderDue({ ...base, createdAt: daysAgo(60), updatedAfterIssueAt: daysAgo(4) }, now)).toBe(true);
    expect(reviewReplyReminderDue({ ...base, createdAt: daysAgo(10), updatedAfterIssueAt: daysAgo(1) }, now)).toBe(false);
  });
});

describe("il giro del mattino", () => {
  it("un avviso solo per professionista, con le recensioni segnate", async () => {
    const review = (id: string, userId: string) => ({ ...base, id, booking: { id: `b-${id}`, professionalProfile: { userId } } });
    const prisma = {
      review: {
        findMany: vi.fn().mockResolvedValue([review("r-1", "pro-1"), review("r-2", "pro-1"), review("r-3", "pro-2")]),
        updateMany: vi.fn().mockImplementation(({ where }: { where: { id: { in: string[] } } }) => Promise.resolve({ count: where.id.in.length })),
      },
    };
    const notifications = { notify: vi.fn() };
    await new ReviewReplyRemindersService(prisma as never, notifications as never).remindReplies(now);
    expect(notifications.notify).toHaveBeenCalledTimes(2);
    expect(notifications.notify).toHaveBeenCalledWith("pro-1", "REVIEW_REPLY_REMINDER", expect.objectContaining({ reviewId: "r-1", count: 2 }));
    expect(notifications.notify).toHaveBeenCalledWith("pro-2", "REVIEW_REPLY_REMINDER", expect.objectContaining({ reviewId: "r-3", count: 1 }));
  });

  it("nessun avviso se nel frattempo il professionista ha risposto", async () => {
    const prisma = {
      review: {
        findMany: vi.fn().mockResolvedValue([{ ...base, id: "r-1", booking: { id: "b-1", professionalProfile: { userId: "pro-1" } } }]),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
    };
    const notifications = { notify: vi.fn() };
    await new ReviewReplyRemindersService(prisma as never, notifications as never).remindReplies(now);
    expect(notifications.notify).not.toHaveBeenCalled();
  });
});
