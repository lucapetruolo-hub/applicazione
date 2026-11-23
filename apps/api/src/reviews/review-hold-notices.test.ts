import { describe, expect, it, vi } from "vitest";
import { ReviewHoldNoticesService, notifyReviewHeldAdmins, reviewHeldNoticeDue } from "./review-hold-notices.service";

/**
 * Recensioni in controllo: avviso agli admin subito e, dopo 7 giorni senza
 * decisione, al cliente e di nuovo agli admin
 * (docs/changelog/2026-11-20-recensioni-in-controllo-avvisi.md).
 */
const now = new Date("2026-11-20T09:20:00Z");
const daysAgo = (days: number) => new Date(now.getTime() - days * 24 * 60 * 60_000);

describe("quando parte il secondo avviso", () => {
  it("dopo 7 giorni in controllo, una volta sola", () => {
    expect(reviewHeldNoticeDue({ heldAt: daysAgo(7), heldNoticeSentAt: null }, now)).toBe(true);
    expect(reviewHeldNoticeDue({ heldAt: daysAgo(6), heldNoticeSentAt: null }, now)).toBe(false);
    expect(reviewHeldNoticeDue({ heldAt: daysAgo(9), heldNoticeSentAt: daysAgo(2) }, now)).toBe(false);
    expect(reviewHeldNoticeDue({ heldAt: null, heldNoticeSentAt: null }, now)).toBe(false);
  });
});

describe("avviso agli admin", () => {
  it("a tutti gli admin, con la scheda del cliente", async () => {
    const prisma = { user: { findMany: vi.fn().mockResolvedValue([{ id: "a-1" }, { id: "a-2" }]) } };
    const notifications = { notify: vi.fn() };
    await notifyReviewHeldAdmins(prisma as never, notifications as never, { reviewId: "r-1", clientId: "c-1" });
    expect(notifications.notify).toHaveBeenCalledTimes(2);
    expect(notifications.notify).toHaveBeenCalledWith("a-1", "ADMIN_REVIEW_HELD", { reviewId: "r-1", clientId: "c-1" });
  });
});

describe("il giro del mattino", () => {
  const held = (id: string) => ({ id, heldAt: daysAgo(8), heldNoticeSentAt: null, booking: { clientId: `c-${id}` } });

  it("ricorda agli admin, segnando la recensione, e al cliente non scrive", async () => {
    const prisma = {
      review: { findMany: vi.fn().mockResolvedValue([held("r-1")]), updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      user: { findMany: vi.fn().mockResolvedValue([{ id: "a-1" }]) },
    };
    const notifications = { notify: vi.fn() };
    await new ReviewHoldNoticesService(prisma as never, notifications as never).noticeLongHeld(now);
    expect(prisma.review.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { heldNoticeSentAt: now } }));
    // Al cliente niente (decisione di Luca del 23/11/2026): un solo avviso, quello agli admin.
    expect(notifications.notify).toHaveBeenCalledTimes(1);
    expect(notifications.notify).toHaveBeenCalledWith("a-1", "ADMIN_REVIEW_HELD", { reviewId: "r-1", clientId: "c-r-1", late: true });
  });

  it("niente se un'altra copia l'ha già segnata o è stata decisa nel frattempo", async () => {
    const prisma = {
      review: { findMany: vi.fn().mockResolvedValue([held("r-1")]), updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
      user: { findMany: vi.fn() },
    };
    const notifications = { notify: vi.fn() };
    await new ReviewHoldNoticesService(prisma as never, notifications as never).noticeLongHeld(now);
    expect(notifications.notify).not.toHaveBeenCalled();
  });
});
