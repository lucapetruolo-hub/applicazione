import { Inject, Injectable, type OnModuleInit } from "@nestjs/common";
import type { PrismaClient } from "@professionisti/database";
import { isLateCancellation, wallClockNow } from "@professionisti/shared";
import { PRISMA } from "../prisma/prisma.module";
import { frontendUrl } from "../email/email-brand";
import { NotificationsService } from "../notifications/notifications.service";
import { TimelineService } from "../timeline/timeline.service";
import { WhatsAppService } from "../whatsapp/whatsapp.service";
import { whatsappDayTime } from "../whatsapp/whatsapp-templates";
import { depositReminderTimes } from "../whatsapp/whatsapp-rules";

/**
 * Pulsanti "Ci sarò" e "Non posso più" del promemoria WhatsApp al cliente
 * (Luca, 29/10/2026, docs/changelog/2026-10-28-promemoria-whatsapp.md):
 * la risposta va nella cronologia della richiesta e al professionista, una
 * volta sola per ciascuna. "Non posso più" non annulla nulla da sé (c'è di
 * mezzo l'acconto): al cliente torna il link per annullare o cambiare data.
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
    action: "CONFIRM" | "CANT_COME";
    now: Date;
  }): Promise<string | null> {
    const booking = await this.prisma.booking.findUnique({
      where: { id: input.bookingId },
      select: {
        clientId: true,
        status: true,
        scheduledAt: true,
        cancellationNoticeHours: true,
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
    const requestUrl = booking.quote?.guidedRequestId
      ? `${frontendUrl()}/le-mie-richieste?open=${encodeURIComponent(booking.quote.guidedRequestId)}`
      : `${frontendUrl()}/le-mie-richieste`;
    if (
      booking.status !== "CONFIRMED" ||
      booking.scheduledAt.getTime() <= wallClockNow(input.now).getTime()
    ) {
      // Una volta sola: la stessa risposta non riparte a ogni tocco.
      const field =
        input.action === "CONFIRM" ? "clientConfirmedAt" : "clientCantComeAt";
      const first = await this.prisma.booking.updateMany({
        where: { id: input.bookingId, [field]: null },
        data: { [field]: input.now },
      });
      return first.count > 0
        ? `Questo appuntamento non è più in programma. Trovi i dettagli nella tua richiesta: ${requestUrl}`
        : null;
    }

    const name = booking.professionalProfile.businessName;
    const guidedRequestId = booking.quote?.guidedRequestId ?? null;
    const payload = {
      bookingId: input.bookingId,
      ...(guidedRequestId
        ? {
            guidedRequestId,
            professionalProfileId: booking.professionalProfileId,
          }
        : {}),
    };

    if (input.action === "CONFIRM") {
      const first = await this.prisma.booking.updateMany({
        where: { id: input.bookingId, clientConfirmedAt: null },
        data: { clientConfirmedAt: input.now },
      });
      if (first.count === 0) return null;
      if (guidedRequestId)
        await this.timelineService.log(
          guidedRequestId,
          booking.professionalProfileId,
          "CLIENT",
          "Il cliente ha confermato su WhatsApp che ci sarà.",
        );
      await this.notificationsService.notify(
        booking.professionalProfile.userId,
        "BOOKING_CLIENT_CONFIRMED",
        payload,
      );
      return `Grazie! Abbiamo detto a ${name} che ci sarai.`;
    }

    const first = await this.prisma.booking.updateMany({
      where: { id: input.bookingId, clientCantComeAt: null },
      data: { clientCantComeAt: input.now },
    });
    if (first.count === 0) return null;
    if (guidedRequestId)
      await this.timelineService.log(
        guidedRequestId,
        booking.professionalProfileId,
        "CLIENT",
        "Il cliente ha risposto al promemoria su WhatsApp che non può più esserci.",
      );
    await this.notificationsService.notify(
      booking.professionalProfile.userId,
      "BOOKING_CLIENT_CANT_COME",
      payload,
    );
    const payment = booking.jobPayment;
    const depositAtStake =
      !!booking.quote?.lateCancelKeepsDeposit &&
      payment?.paymentMethod === "MANOVIA" &&
      !payment.depositKeptAt &&
      payment.paidEurCents - payment.refundedEurCents > 0 &&
      !isLateCancellation(
        booking.scheduledAt,
        booking.cancellationNoticeHours,
        input.now,
      );
    const deadline = depositAtStake
      ? depositReminderTimes(
          booking.scheduledAt,
          booking.cancellationNoticeHours ?? 24,
        ).deadline
      : null;
    return [
      `Abbiamo avvisato ${name}. Per annullare o proporre un'altra data apri la tua richiesta: ${requestUrl}`,
      deadline
        ? `Se annulli entro ${whatsappDayTime(deadline)}, l'acconto ti torna indietro.`
        : null,
    ]
      .filter(Boolean)
      .join("\n\n");
  }
}
