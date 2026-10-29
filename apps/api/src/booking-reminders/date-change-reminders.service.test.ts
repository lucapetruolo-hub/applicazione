import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@professionisti/database";
import { DateChangeRemindersService } from "./date-change-reminders.service";
import type { NotificationsService } from "../notifications/notifications.service";

// Altra data senza risposta da 12 ore: un promemoria a chi deve rispondere
// (docs/changelog/2026-10-28-promemoria-whatsapp.md).

function setup(proposedBy: string | null) {
  const booking = {
    id: "b1",
    clientId: "c1",
    scheduledAt: new Date("2099-03-10T10:00:00.000Z"),
    scheduledEndAt: new Date("2099-03-10T12:00:00.000Z"),
    rescheduleProposedBy: proposedBy,
    rescheduleReminderAt: null as Date | null,
    professionalProfileId: "p1",
    professionalProfile: { userId: "pro1" },
    quote: {
      id: "q1",
      guidedRequestId: "r1",
      clientProposedDate: new Date("2099-03-12T15:00:00.000Z"),
      clientProposedEndDate: null,
    },
  };
  const findMany = vi.fn(async () =>
    booking.rescheduleReminderAt ? [] : [booking],
  );
  const prisma = {
    booking: {
      findMany,
      updateMany: vi.fn(async () => {
        if (booking.rescheduleReminderAt) return { count: 0 };
        booking.rescheduleReminderAt = new Date();
        return { count: 1 };
      }),
    },
  };
  const notify = vi.fn(async () => undefined);
  const service = new DateChangeRemindersService(
    prisma as unknown as PrismaClient,
    { notify } as unknown as NotificationsService,
  );
  return { service, notify, findMany };
}

// 29/10/2026 alle 11 italiane (10 UTC, ora solare dal 25/10).
const DAY = new Date("2026-10-29T10:00:00.000Z");

describe("Promemoria dopo 12 ore senza risposta sulla nuova data", () => {
  it("al professionista se l'ha proposta il cliente, una volta sola", async () => {
    const { service, notify, findMany } = setup("CLIENT");
    expect(await service.remindUnanswered(DAY)).toBe(1);
    expect(notify).toHaveBeenCalledWith(
      "pro1",
      "QUOTE_DATE_PROPOSED",
      expect.objectContaining({
        booked: true,
        reminder: true,
        bookingId: "b1",
      }),
    );
    const where = (
      findMany.mock.calls[0] as unknown as [
        { where: { rescheduleRequestedAt: { lte: Date } } },
      ]
    )[0].where;
    expect(where.rescheduleRequestedAt.lte.toISOString()).toBe(
      "2026-10-28T22:00:00.000Z",
    );
    expect(await service.remindUnanswered(DAY)).toBe(0);
  });

  it("al cliente se l'ha proposta il professionista", async () => {
    const { service, notify } = setup("PROFESSIONAL");
    await service.remindUnanswered(DAY);
    expect(notify).toHaveBeenCalledWith(
      "c1",
      "QUOTE_DATE_CHANGED",
      expect.objectContaining({ booked: true, reminder: true }),
    );
  });

  it("mai di notte", async () => {
    const { service, notify } = setup("CLIENT");
    expect(
      await service.remindUnanswered(new Date("2026-10-29T21:30:00.000Z")),
    ).toBe(0);
    expect(notify).not.toHaveBeenCalled();
  });
});
