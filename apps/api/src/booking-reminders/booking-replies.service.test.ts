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
    // Sabato 16 alle 10:30 (orario di parete): preavviso di 24 ore già iniziato.
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
      findUnique: vi.fn(async () => ({ ...booking })),
      updateMany: vi.fn(
        async ({
          where,
          data,
        }: {
          where: Record<string, unknown>;
          data: Record<string, unknown>;
        }) => {
          const ok = Object.entries(where).every(([key, cond]) =>
            key === "id"
              ? true
              : cond === null
                ? booking[key] === null
                : booking[key] !== null,
          );
          if (!ok) return { count: 0 };
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
  const reply = (
    action: Parameters<BookingRepliesService["reply"]>[0]["action"],
    clientId = "c1",
  ) => service.reply({ clientId, bookingId: "b1", action, now: NOW });
  return { reply, booking, notify, log };
}

describe("BookingRepliesService", () => {
  it("'Ci sarò': cronologia e campanella del professionista, una volta sola, con 'Ho sbagliato'", async () => {
    const { reply, notify, log } = setup();
    expect(await reply("CONFIRM")).toEqual({
      text: "Grazie! Abbiamo detto a Rossi Idraulica che ci sarai.",
      undo: true,
    });
    expect(await reply("CONFIRM")).toBeNull();
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

  it("'Ho sbagliato' dopo 'Ci sarò' toglie la conferma, senza pulsante, e si può confermare di nuovo", async () => {
    const { reply, booking, notify } = setup();
    await reply("CONFIRM");
    const undone = await reply("UNDO_CONFIRM");
    expect(undone).toMatchObject({ undo: false });
    expect(undone!.text).toContain("Non posso più");
    expect(booking.clientConfirmedAt).toBeNull();
    expect(await reply("UNDO_CONFIRM")).toBeNull();
    expect(notify).toHaveBeenCalledTimes(1);
    expect(await reply("CONFIRM")).not.toBeNull();
  });

  it("'Ho sbagliato' dopo 'Non posso più': il professionista sa che il cliente ci sarà", async () => {
    const { reply, booking, notify, log } = setup();
    await reply("CANT_COME");
    expect(await reply("UNDO_CANT_COME")).toEqual({
      text: "Fatto: abbiamo detto a Rossi Idraulica che era un errore e che ci sarai.",
      undo: false,
    });
    expect(booking.clientCantComeAt).toBeNull();
    expect(booking.clientConfirmedAt).toEqual(NOW);
    expect(notify).toHaveBeenLastCalledWith(
      "pro1",
      "BOOKING_CLIENT_CANT_COME_UNDONE",
      expect.objectContaining({ bookingId: "b1" }),
    );
    expect(log).toHaveBeenLastCalledWith(
      "r1",
      "p1",
      "CLIENT",
      "Il cliente aveva premuto «Non posso più» per errore: ci sarà.",
    );
  });

  it("'Ci sarò' nel promemoria dopo 'Non posso più' vale come correzione", async () => {
    const { reply, booking, notify } = setup();
    await reply("CANT_COME");
    await reply("CONFIRM");
    expect(booking.clientCantComeAt).toBeNull();
    expect(notify).toHaveBeenLastCalledWith(
      "pro1",
      "BOOKING_CLIENT_CANT_COME_UNDONE",
      expect.anything(),
    );
  });

  it("'Non posso più' non annulla: avvisa e manda il link, con la scadenza dell'acconto finché vale", async () => {
    const { reply, notify } = setup({
      scheduledAt: new Date("2027-01-18T10:30:00Z"),
      cancellationNoticeHours: 48,
    });
    const answer = await reply("CANT_COME");
    expect(answer!.undo).toBe(true);
    expect(answer!.text).toContain("Abbiamo avvisato Rossi Idraulica.");
    expect(answer!.text).toContain("/le-mie-richieste?open=r1");
    expect(answer!.text).toContain(
      "Se annulli entro sabato 16 gennaio alle 10:30, l'acconto ti torna indietro.",
    );
    expect(notify).toHaveBeenCalledWith(
      "pro1",
      "BOOKING_CLIENT_CANT_COME",
      expect.objectContaining({ bookingId: "b1" }),
    );
  });

  it("dentro il preavviso niente frase sull'acconto", async () => {
    const { reply } = setup();
    expect((await reply("CANT_COME"))!.text).not.toContain("acconto");
  });

  it("appuntamento non più in programma o di un altro cliente: nessun avviso", async () => {
    const canceled = setup({ status: "CANCELED" });
    expect((await canceled.reply("CONFIRM"))!.text).toContain(
      "non è più in programma",
    );
    expect(await canceled.reply("UNDO_CONFIRM")).toBeNull();
    expect(canceled.notify).not.toHaveBeenCalled();
    const other = setup();
    expect(await other.reply("CONFIRM", "c2")).toBeNull();
    expect(other.notify).not.toHaveBeenCalled();
  });
});
