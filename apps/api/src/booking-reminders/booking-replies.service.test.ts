import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@professionisti/database";
import { BookingRepliesService } from "./booking-replies.service";
import type { NotificationsService } from "../notifications/notifications.service";
import type { TimelineService } from "../timeline/timeline.service";
import type { WhatsAppService } from "../whatsapp/whatsapp.service";

// Venerdì 15 gennaio 2027 alle 11 italiane.
const NOW = new Date("2027-01-15T10:00:00Z");

function setup(extra: Record<string, unknown> = {}) {
  const booking: Record<string, unknown> = {
    clientId: "c1",
    status: "CONFIRMED",
    // Sabato 16 alle 10:30 (orario di parete), preavviso di 48 ore già iniziato.
    scheduledAt: new Date("2027-01-16T10:30:00Z"),
    cancellationNoticeHours: 24,
    clientConfirmedAt: null,
    clientCantComeAt: null,
    professionalProfileId: "p1",
    professionalProfile: { userId: "pro1", businessName: "Rossi Idraulica" },
    quote: { guidedRequestId: "r1", lateCancelKeepsDeposit: true },
    jobPayment: {
      paymentMethod: "MANOVIA",
      paidEurCents: 5000,
      refundedEurCents: 0,
      depositKeptAt: null,
    },
    ...extra,
  };
  const prisma = {
    booking: {
      findUnique: vi.fn(async () => booking),
      updateMany: vi.fn(
        async ({
          where,
          data,
        }: {
          where: Record<string, unknown>;
          data: Record<string, unknown>;
        }) => {
          const field = Object.keys(data)[0]!;
          if (field in where && booking[field] !== null) return { count: 0 };
          Object.assign(booking, data);
          return { count: 1 };
        },
      ),
    },
  };
  const notify = vi.fn(async () => undefined);
  const log = vi.fn(async () => undefined);
  const service = new BookingRepliesService(
    prisma as unknown as PrismaClient,
    { onBookingReply: vi.fn() } as unknown as WhatsAppService,
    { notify } as unknown as NotificationsService,
    { log } as unknown as TimelineService,
  );
  return { service, notify, log };
}

describe("BookingRepliesService", () => {
  it("'Ci sarò': cronologia e campanella del professionista, una volta sola", async () => {
    const { service, notify, log } = setup();
    const input = {
      clientId: "c1",
      bookingId: "b1",
      action: "CONFIRM" as const,
      now: NOW,
    };
    expect(await service.reply(input)).toBe(
      "Grazie! Abbiamo detto a Rossi Idraulica che ci sarai.",
    );
    expect(await service.reply(input)).toBeNull();
    expect(log).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith(
      "r1",
      "p1",
      "CLIENT",
      "Il cliente ha confermato su WhatsApp che ci sarà.",
    );
    expect(notify).toHaveBeenCalledWith("pro1", "BOOKING_CLIENT_CONFIRMED", {
      bookingId: "b1",
      guidedRequestId: "r1",
      professionalProfileId: "p1",
    });
  });

  it("'Non posso più' non annulla: avvisa e manda il link, con la scadenza dell'acconto finché vale", async () => {
    const { service, notify } = setup({
      scheduledAt: new Date("2027-01-18T10:30:00Z"),
      cancellationNoticeHours: 48,
    });
    const reply = await service.reply({
      clientId: "c1",
      bookingId: "b1",
      action: "CANT_COME",
      now: NOW,
    });
    expect(reply).toContain("Abbiamo avvisato Rossi Idraulica.");
    expect(reply).toContain("/le-mie-richieste?open=r1");
    expect(reply).toContain(
      "Se annulli entro sabato 16 gennaio alle 10:30, l'acconto ti torna indietro.",
    );
    expect(notify).toHaveBeenCalledWith(
      "pro1",
      "BOOKING_CLIENT_CANT_COME",
      expect.objectContaining({ bookingId: "b1" }),
    );
  });

  it("dentro il preavviso niente frase sull'acconto", async () => {
    const { service } = setup();
    const reply = await service.reply({
      clientId: "c1",
      bookingId: "b1",
      action: "CANT_COME",
      now: NOW,
    });
    expect(reply).not.toContain("acconto");
  });

  it("appuntamento non più in programma o di un altro cliente: nessun avviso", async () => {
    const canceled = setup({ status: "CANCELED" });
    expect(
      await canceled.service.reply({
        clientId: "c1",
        bookingId: "b1",
        action: "CONFIRM",
        now: NOW,
      }),
    ).toContain("non è più in programma");
    expect(canceled.notify).not.toHaveBeenCalled();
    const other = setup();
    expect(
      await other.service.reply({
        clientId: "c2",
        bookingId: "b1",
        action: "CONFIRM",
        now: NOW,
      }),
    ).toBeNull();
    expect(other.notify).not.toHaveBeenCalled();
  });
});
