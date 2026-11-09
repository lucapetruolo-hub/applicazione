import { describe, expect, it, vi } from "vitest";
import { ReviewReminderService } from "./review-reminder.service";

/** Un solo promemoria della recensione (docs/changelog/2026-11-09-passaparola.md). */
describe("ReviewReminderService", () => {
  const now = new Date("2026-11-20T10:00:00Z");

  function build(bookings: { id: string; clientId: string; quote: { guidedRequestId: string } | null }[], updated = 1) {
    const prisma = {
      booking: {
        findMany: vi.fn().mockResolvedValue(bookings),
        updateMany: vi.fn().mockResolvedValue({ count: updated }),
      },
    };
    const notifications = { notify: vi.fn().mockResolvedValue(undefined) };
    return { service: new ReviewReminderService(prisma as never, notifications as never), prisma, notifications };
  }

  it("scrive a chi ha confermato da 3 a 14 giorni fa, senza recensione né segnalazione aperta, una volta", async () => {
    const { service, prisma, notifications } = build([{ id: "b-1", clientId: "c-1", quote: { guidedRequestId: "r-1" } }]);
    await expect(service.run(now)).resolves.toBe(1);
    const where = prisma.booking.findMany.mock.calls[0]![0].where;
    expect(where.clientConfirmedCompletedAt).toEqual({ lte: new Date("2026-11-17T10:00:00Z"), gte: new Date("2026-11-06T10:00:00Z") });
    expect(where).toMatchObject({ completionAutoClosedAt: null, reviewReminderSentAt: null, review: { is: null } });
    expect(where.OR).toEqual([{ issue: { is: null } }, { issue: { is: { status: { notIn: ["OPEN", "CHAT"] } } } }]);
    // Nessun filtro su voti, chat o pagamenti: la regola è uguale per tutti.
    expect(JSON.stringify(where)).not.toMatch(/rating|payment/i);
    expect(prisma.booking.updateMany).toHaveBeenCalledWith({ where: { id: "b-1", reviewReminderSentAt: null }, data: { reviewReminderSentAt: now } });
    expect(notifications.notify).toHaveBeenCalledWith("c-1", "REVIEW_REMINDER", { bookingId: "b-1", guidedRequestId: "r-1" });
  });

  it("se un altro giro l'ha già segnato non scrive di nuovo", async () => {
    const { service, notifications } = build([{ id: "b-1", clientId: "c-1", quote: null }], 0);
    await expect(service.run(now)).resolves.toBe(0);
    expect(notifications.notify).not.toHaveBeenCalled();
  });
});
