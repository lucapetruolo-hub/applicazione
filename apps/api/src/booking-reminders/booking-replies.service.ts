import { Inject, Injectable, type OnModuleInit } from "@nestjs/common";
import type { PrismaClient } from "@professionisti/database";
import { isLateCancellation, wallClockNow } from "@professionisti/shared";
import { PRISMA } from "../prisma/prisma.module";
import { frontendUrl } from "../email/email-brand";
import { NotificationsService } from "../notifications/notifications.service";
import { TimelineService } from "../timeline/timeline.service";
import {
  WhatsAppService,
  type BookingReplyAction,
} from "../whatsapp/whatsapp.service";
import { whatsappDayTime } from "../whatsapp/whatsapp-templates";
import { depositReminderTimes } from "../whatsapp/whatsapp-rules";

type Reply = { text: string; undo: boolean } | null;

/**
 * Pulsanti "Ci sarò" e "Non posso più" del promemoria WhatsApp al cliente
 * (Luca, 29/10/2026, docs/changelog/2026-10-28-promemoria-whatsapp.md):
 * la risposta va nella cronologia della richiesta e al professionista, una
 * volta sola per ciascuna. "Non posso più" non annulla nulla da sé (c'è di
 * mezzo l'acconto): al cliente torna il link per annullare o cambiare data.
 * Sotto la risposta il pulsante "Ho sbagliato" la toglie, perché si può
 * premere per errore (Luca).
 */
@Injectable()
export class BookingRepliesService implements OnModuleInit {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly whatsAppService: WhatsAppService,
    private readonly notificationsService: NotificationsService,
    private readonly timelineService: TimelineService,
  ) {}

  onModuleInit(): void {
    this.whatsAppService.onBookingReply((input) => this.reply(input));
  }

  async reply(input: {
    clientId: string;
    bookingId: string;
    action: BookingReplyAction;
    now: Date;
  }): Promise<Reply> {
    const booking = await this.prisma.booking.findUnique({
      where: { id: input.bookingId },
      select: {
        clientId: true,
        status: true,
        scheduledAt: true,
        cancellationNoticeHours: true,
        clientConfirmedAt: true,
        clientCantComeAt: true,
        professionalProfileId: true,
        professionalProfile: { select: { userId: true, businessName: true } },
        quote: {
          select: { guidedRequestId: true, lateCancelKeepsDeposit: true },
        },
        jobPayment: {
          select: {
            paymentMethod: true,
            paidEurCents: true,
            refundedEurCents: true,
            depositKeptAt: true,
          },
        },
      },
    });
    if (!booking || booking.clientId !== input.clientId) return null;
    const guidedRequestId = booking.quote?.guidedRequestId ?? null;
    const requestUrl = guidedRequestId
      ? `${frontendUrl()}/le-mie-richieste?open=${encodeURIComponent(guidedRequestId)}`
      : `${frontendUrl()}/le-mie-richieste`;
    if (
      booking.status !== "CONFIRMED" ||
      booking.scheduledAt.getTime() <= wallClockNow(input.now).getTime()
    ) {
      if (input.action === "UNDO_CONFIRM" || input.action === "UNDO_CANT_COME")
        return null;
      // Una volta sola: la stessa risposta non riparte a ogni tocco.
      const field =
        input.action === "CONFIRM" ? "clientConfirmedAt" : "clientCantComeAt";
      const first = await this.prisma.booking.updateMany({
        where: { id: input.bookingId, [field]: null },
        data: { [field]: input.now },
      });
      return first.count > 0
        ? {
            text: `Questo appuntamento non è più in programma. Trovi i dettagli nella tua richiesta: ${requestUrl}`,
            undo: false,
          }
        : null;
    }

    const name = booking.professionalProfile.businessName;
    const payload = {
      bookingId: input.bookingId,
      ...(guidedRequestId
        ? {
            guidedRequestId,
            professionalProfileId: booking.professionalProfileId,
          }
        : {}),
    };
    const log = (message: string) =>
      guidedRequestId
        ? this.timelineService.log(
            guidedRequestId,
            booking.professionalProfileId,
            "CLIENT",
            message,
          )
        : Promise.resolve();
    const notify = (type: string) =>
      this.notificationsService.notify(
        booking.professionalProfile.userId,
        type,
        payload,
      );

    switch (input.action) {
      case "CONFIRM": {
        // Toglie anche un "Non posso più" di prima: vale l'ultima risposta.
        const first = await this.prisma.booking.updateMany({
          where: { id: input.bookingId, clientConfirmedAt: null },
          data: { clientConfirmedAt: input.now, clientCantComeAt: null },
        });
        if (first.count === 0) return null;
        await log("Il cliente ha confermato su WhatsApp che ci sarà.");
        // Dopo un "Non posso più" (avvisato anche per email) serve dirlo forte.
        await notify(
          booking.clientCantComeAt
            ? "BOOKING_CLIENT_CANT_COME_UNDONE"
            : "BOOKING_CLIENT_CONFIRMED",
        );
        return {
          text: `Grazie! Abbiamo detto a ${name} che ci sarai.`,
          undo: true,
        };
      }
      case "UNDO_CONFIRM": {
        const undone = await this.prisma.booking.updateMany({
          where: { id: input.bookingId, clientConfirmedAt: { not: null } },
          data: { clientConfirmedAt: null },
        });
        if (undone.count === 0) return null;
        // La conferma era arrivata solo nella campanella: basta la cronologia.
        await log("Il cliente ha tolto la conferma: aveva premuto per errore.");
        return {
          text: "Fatto, abbiamo tolto la conferma. Se non puoi più esserci, premi «Non posso più» nel promemoria.",
          undo: false,
        };
      }
      case "CANT_COME": {
        const first = await this.prisma.booking.updateMany({
          where: { id: input.bookingId, clientCantComeAt: null },
          data: { clientCantComeAt: input.now, clientConfirmedAt: null },
        });
        if (first.count === 0) return null;
        await log(
          "Il cliente ha risposto al promemoria su WhatsApp che non può più esserci.",
        );
        await notify("BOOKING_CLIENT_CANT_COME");
        const deadline = this.depositDeadline(booking, input.now);
        return {
          text: [
            `Abbiamo avvisato ${name}. Per annullare o proporre un'altra data apri la tua richiesta: ${requestUrl}`,
            deadline
              ? `Se annulli entro ${whatsappDayTime(deadline)}, l'acconto ti torna indietro.`
              : null,
          ]
            .filter(Boolean)
            .join("\n\n"),
          undo: true,
        };
      }
      case "UNDO_CANT_COME": {
        // Premuto per errore: il professionista era stato avvisato anche per
        // email, quindi gli si dice che il cliente ci sarà.
        const undone = await this.prisma.booking.updateMany({
          where: { id: input.bookingId, clientCantComeAt: { not: null } },
          data: { clientCantComeAt: null, clientConfirmedAt: input.now },
        });
        if (undone.count === 0) return null;
        await log(
          "Il cliente aveva premuto «Non posso più» per errore: ci sarà.",
        );
        await notify("BOOKING_CLIENT_CANT_COME_UNDONE");
        return {
          text: `Fatto: abbiamo detto a ${name} che era un errore e che ci sarai.`,
          undo: false,
        };
      }
    }
  }

  /** Fino a quando il cliente riavrebbe l'acconto annullando, se è ancora in tempo. */
  private depositDeadline(
    booking: {
      scheduledAt: Date;
      cancellationNoticeHours: number | null;
      quote: { lateCancelKeepsDeposit: boolean } | null;
      jobPayment: {
        paymentMethod: string;
        paidEurCents: number;
        refundedEurCents: number;
        depositKeptAt: Date | null;
      } | null;
    },
    now: Date,
  ): Date | null {
    const payment = booking.jobPayment;
    const atStake =
      !!booking.quote?.lateCancelKeepsDeposit &&
      payment?.paymentMethod === "MANOVIA" &&
      !payment.depositKeptAt &&
      payment.paidEurCents - payment.refundedEurCents > 0 &&
      !isLateCancellation(
        booking.scheduledAt,
        booking.cancellationNoticeHours,
        now,
      );
    return atStake
      ? depositReminderTimes(
          booking.scheduledAt,
          booking.cancellationNoticeHours ?? 24,
        ).deadline
      : null;
  }
}
