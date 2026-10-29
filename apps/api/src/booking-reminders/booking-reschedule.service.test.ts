import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@professionisti/database";
import {
  BookingRescheduleService,
  rescheduledSpan,
} from "./booking-reschedule.service";
import type { NotificationsService } from "../notifications/notifications.service";
import type { TimelineService } from "../timeline/timeline.service";
import type { WhatsAppService } from "../whatsapp/whatsapp.service";

// Venerdì 15 gennaio 2027 alle 11 italiane.
const NOW = new Date("2027-01-15T10:00:00Z");

function setup(extra: Record<string, unknown> = {}) {
  const booking: Record<string, unknown> = {
    id: "b1",
    clientId: "c1",
    status: "CONFIRMED",
    scheduledAt: new Date("2027-01-16T10:30:00Z"),
    scheduledEndAt: new Date("2027-01-16T12:00:00Z"),
    clientCantComeAt: null,
    rescheduleProposedAt: null,
    rescheduleProposedEndAt: null,
    rescheduleNote: null,
    professionalProfileId: "p1",
    professionalProfile: { userId: "pro1" },
    quote: { guidedRequestId: "r1" },
    reminderSentAt: new Date("2027-01-15T09:00:00Z"),
    clientConfirmedAt: null,
    ...extra,
  };
  const prisma = {
    booking: {
      findUnique: vi.fn(async () => ({ ...booking })),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        Object.assign(booking, data);
        return booking;
      }),
      updateMany: vi.fn(
        async ({
          where,
          data,
        }: {
          where: Record<string, unknown>;
          data: Record<string, unknown>;
        }) => {
          const proposed = where.rescheduleProposedAt as Date;
          if (
            (booking.rescheduleProposedAt as Date | null)?.getTime() !==
            proposed.getTime()
          )
            return { count: 0 };
          Object.assign(booking, data);
          return { count: 1 };
        },
      ),
    },
  };
  const notify = vi.fn(async () => undefined);
  const log = vi.fn(async () => undefined);
  const forgetBookingReminders = vi.fn(async () => undefined);
  const service = new BookingRescheduleService(
    prisma as unknown as PrismaClient,
    { notify } as unknown as NotificationsService,
    { log } as unknown as TimelineService,
    { forgetBookingReminders } as unknown as WhatsAppService,
  );
  return { service, booking, notify, log, forgetBookingReminders };
}

describe("Proponi un'altra data per un appuntamento fissato", () => {
  it("il cliente propone: la data resta com'era, il professionista è avvisato", async () => {
    const { service, booking, notify, log } = setup();
    await service.propose(
      "c1",
      "b1",
      {
        date: "2027-01-20",
        startTime: "09:00",
        endTime: "10:30",
        note: "Dopo le 9",
      },
      NOW,
    );
    expect(booking.scheduledAt).toEqual(new Date("2027-01-16T10:30:00Z"));
    expect(booking.rescheduleProposedAt).toEqual(
      new Date("2027-01-20T09:00:00Z"),
    );
    expect(booking.rescheduleProposedEndAt).toEqual(
      new Date("2027-01-20T10:30:00Z"),
    );
    expect(booking.clientCantComeAt).toEqual(NOW);
    expect(log).toHaveBeenCalledWith(
      "r1",
      "p1",
      "CLIENT",
      expect.stringContaining(
        "propone di spostare l'appuntamento a mercoledì 20 gennaio alle 09:00",
      ),
    );
    expect(notify).toHaveBeenCalledWith(
      "pro1",
      "BOOKING_RESCHEDULE_PROPOSED",
      expect.objectContaining({
        bookingId: "b1",
        note: "Dopo le 9",
        to: {
          start: "2027-01-20T09:00:00.000Z",
          end: "2027-01-20T10:30:00.000Z",
        },
      }),
    );
  });

  it("rifiuta date passate, orari al contrario, la stessa data e chi non è il cliente", async () => {
    const { service } = setup();
    const propose = (
      input: { date: string; startTime: string; endTime: string },
      who = "c1",
    ) => service.propose(who, "b1", input, NOW);
    await expect(
      propose({ date: "2027-01-14", startTime: "09:00", endTime: "10:00" }),
    ).rejects.toThrow("deve ancora venire");
    await expect(
      propose({ date: "2027-01-20", startTime: "11:00", endTime: "10:00" }),
    ).rejects.toThrow("dopo l'ora di inizio");
    await expect(
      propose({ date: "2027-01-16", startTime: "10:30", endTime: "12:00" }),
    ).rejects.toThrow("scegline un'altra");
    await expect(
      propose(
        { date: "2027-01-20", startTime: "09:00", endTime: "10:00" },
        "c2",
      ),
    ).rejects.toThrow("non è tuo");
    const canceled = setup({ status: "CANCELED" });
    await expect(
      canceled.service.propose(
        "c1",
        "b1",
        { date: "2027-01-20", startTime: "09:00", endTime: "10:00" },
        NOW,
      ),
    ).rejects.toThrow("non si può più spostare");
  });

  it("il professionista accetta: l'appuntamento si sposta e promemoria e risposte ripartono", async () => {
    const { service, booking, notify, forgetBookingReminders } = setup({
      rescheduleProposedAt: new Date("2027-01-20T09:00:00Z"),
      rescheduleProposedEndAt: new Date("2027-01-20T10:30:00Z"),
      clientCantComeAt: NOW,
    });
    await expect(service.accept("c1", "b1", NOW)).rejects.toThrow("non è tuo");
    await service.accept("pro1", "b1", NOW);
    expect(booking).toMatchObject({
      scheduledAt: new Date("2027-01-20T09:00:00Z"),
      scheduledEndAt: new Date("2027-01-20T10:30:00Z"),
      rescheduleProposedAt: null,
      reminderSentAt: null,
      clientCantComeAt: null,
      clientConfirmedAt: null,
    });
    expect(forgetBookingReminders).toHaveBeenCalledWith("b1", NOW);
    expect(notify).toHaveBeenCalledWith(
      "c1",
      "BOOKING_RESCHEDULE_ACCEPTED",
      expect.objectContaining({
        from: {
          start: "2027-01-16T10:30:00.000Z",
          end: "2027-01-16T12:00:00.000Z",
        },
        to: {
          start: "2027-01-20T09:00:00.000Z",
          end: "2027-01-20T10:30:00.000Z",
        },
      }),
    );
  });

  it("il professionista rifiuta: la proposta sparisce e l'appuntamento resta com'era", async () => {
    const { service, booking, notify } = setup({
      rescheduleProposedAt: new Date("2027-01-20T09:00:00Z"),
    });
    await service.reject("pro1", "b1", { note: "Quel giorno sono fuori" });
    expect(booking.rescheduleProposedAt).toBeNull();
    expect(booking.scheduledAt).toEqual(new Date("2027-01-16T10:30:00Z"));
    expect(notify).toHaveBeenCalledWith(
      "c1",
      "BOOKING_RESCHEDULE_REJECTED",
      expect.objectContaining({ note: "Quel giorno sono fuori" }),
    );
  });

  it("un lavoro su più giorni tiene gli stessi giorni", () => {
    const span = rescheduledSpan(
      {
        scheduledAt: new Date("2027-01-16T08:00:00Z"),
        scheduledEndAt: new Date("2027-01-18T17:00:00Z"),
      },
      { date: "2027-01-25", startTime: "09:00", endTime: "18:00" },
    );
    expect(span.end).toEqual(new Date("2027-01-27T18:00:00Z"));
  });
});
