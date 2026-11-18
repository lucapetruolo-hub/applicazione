import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@professionisti/database";
import { DateChangeRemindersService, lastCallHorizon } from "./date-change-reminders.service";
import type { TimelineService } from "../timeline/timeline.service";
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
    { log: vi.fn() } as unknown as TimelineService,
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


// Proposta ancora senza risposta a poche ore dall'appuntamento
// (docs/changelog/2026-11-18-sposta-e-terminato-in-anticipo.md).
function lastCallSetup(proposedBy: "CLIENT" | "PROFESSIONAL", opts: { past?: boolean; clientCantComeAt?: Date | null } = {}) {
  const booking = {
    id: "b1",
    clientId: "c1",
    scheduledAt: new Date("2026-11-20T15:00:00.000Z"),
    scheduledEndAt: new Date("2026-11-20T17:00:00.000Z"),
    rescheduleProposedBy: proposedBy,
    rescheduleRequestedAt: new Date("2026-11-19T10:00:00.000Z"),
    rescheduleLastCallAt: null as Date | null,
    clientCantComeAt: opts.clientCantComeAt ?? null,
    professionalProfileId: "p1",
    professionalProfile: { userId: "pro1" },
    quote: { id: "q1", guidedRequestId: "r1", clientProposedDate: new Date("2026-11-25T15:00:00.000Z"), clientProposedEndDate: null },
  };
  const findMany = vi.fn(async (args: { where: { rescheduleLastCallAt?: null } }) => {
    if (args.where.rescheduleLastCallAt === null) return booking.rescheduleLastCallAt ? [] : [booking];
    return opts.past ? [booking] : [];
  });
  const bookingUpdateMany = vi.fn(async (args: { data: Record<string, unknown> }) => {
    if ("rescheduleLastCallAt" in args.data && args.data.rescheduleLastCallAt) {
      if (booking.rescheduleLastCallAt) return { count: 0 };
      booking.rescheduleLastCallAt = new Date();
    }
    return { count: 1 };
  });
  const quoteUpdate = vi.fn(async () => ({}));
  const log = vi.fn(async () => undefined);
  const notify = vi.fn(async () => undefined);
  const prisma = { booking: { findMany, updateMany: bookingUpdateMany }, quote: { update: quoteUpdate } };
  const service = new DateChangeRemindersService(
    prisma as unknown as PrismaClient,
    { notify } as unknown as NotificationsService,
    { log } as unknown as TimelineService,
  );
  return { service, notify, findMany, bookingUpdateMany, quoteUpdate, log };
}

// 20/11/2026 alle 13 italiane (12 UTC): appuntamento alle 15, tra 2 ore.
const NOON = new Date("2026-11-20T12:00:00.000Z");

describe("Ultimo avviso sulla proposta senza risposta e scadenza", () => {
  it("avvisa tutti e due una volta sola, dicendo chi aveva proposto", async () => {
    const { service, notify } = lastCallSetup("PROFESSIONAL");
    expect((await service.lastCallAndExpire(NOON)).warned).toBe(1);
    expect(notify).toHaveBeenCalledWith("c1", "BOOKING_DATE_CHANGE_UNANSWERED", expect.objectContaining({ audience: "client", proposedBy: "PROFESSIONAL", clientCancelsFree: true }));
    expect(notify).toHaveBeenCalledWith("pro1", "BOOKING_DATE_CHANGE_UNANSWERED", expect.objectContaining({ audience: "professional", proposedBy: "PROFESSIONAL" }));
    expect((await service.lastCallAndExpire(NOON)).warned).toBe(0);
    expect(notify).toHaveBeenCalledTimes(2);
  });

  it("al cliente che aveva detto di non poter venire non promette l'annullamento gratis", async () => {
    const { service, notify } = lastCallSetup("PROFESSIONAL", { clientCantComeAt: new Date("2026-11-19T09:00:00.000Z") });
    await service.lastCallAndExpire(NOON);
    const clientCall = (notify.mock.calls as unknown as [string, string, Record<string, unknown>][]).find((c) => c[0] === "c1");
    expect(clientCall?.[2].clientCancelsFree).toBeUndefined();
  });

  it("di notte non scrive, ma la proposta passata scade lo stesso", async () => {
    const { service, notify, quoteUpdate, log } = lastCallSetup("CLIENT", { past: true });
    const result = await service.lastCallAndExpire(new Date("2026-11-20T22:30:00.000Z"));
    expect(result).toEqual({ warned: 0, expired: 1 });
    expect(notify).not.toHaveBeenCalled();
    expect(quoteUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ clientProposedDate: null }) }));
    expect(log).toHaveBeenCalledWith("r1", "p1", "SYSTEM", expect.stringContaining("scaduta"));
  });

  it("guarda le prossime 3 ore, e alle 20 anche il mattino dopo fino alle 11", () => {
    expect(lastCallHorizon(new Date("2026-11-20T13:00:00.000Z")).toISOString()).toBe("2026-11-20T16:00:00.000Z");
    expect(lastCallHorizon(new Date("2026-11-20T20:00:00.000Z")).toISOString()).toBe("2026-11-21T11:00:00.000Z");
  });
});
