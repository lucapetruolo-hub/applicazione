import {
  Inject,
  Injectable,
  NotFoundException,
  type OnModuleInit,
} from "@nestjs/common";
import type { PrismaClient } from "@professionisti/database";
import {
  wallClockNow,
  type AppointmentReplyState,
} from "@professionisti/shared";
import { PRISMA } from "../prisma/prisma.module";
import { frontendUrl } from "../email/email-brand";
import { NotificationsService } from "../notifications/notifications.service";
import { TimelineService } from "../timeline/timeline.service";
import {
  WhatsAppService,
  type BookingReplyAction,
} from "../whatsapp/whatsapp.service";
import { whatsappDayTime } from "../whatsapp/whatsapp-templates";
import { DEPOSIT_DEADLINE_SELECT, depositDeadline } from "./deposit-deadline";

type Reply = { text: string; undo: boolean } | null;

/** Da dove arriva la risposta: pulsanti di WhatsApp o dell'email del giorno prima. */
export type BookingReplyChannel = "WHATSAPP" | "EMAIL";

/** Link alla richiesta del cliente; con `cambiaData` apre subito "Proponi un'altra data". */
export function clientRequestUrl(
  guidedRequestId: string | null,
  options: { changeDate?: boolean } = {},
): string {
  if (!guidedRequestId) return `${frontendUrl()}/le-mie-richieste`;
  return `${frontendUrl()}/le-mie-richieste?open=${encodeURIComponent(guidedRequestId)}${options.changeDate ? "&cambiaData=1" : ""}`;
}

/**
 * Pulsanti "Ci sarò" e "Non posso più" del promemoria al cliente, su
 * WhatsApp e nell'email del giorno prima (Luca, 29/10/2026,
 * docs/changelog/2026-10-28-promemoria-whatsapp.md): la risposta va nella
 * cronologia della richiesta e al professionista, una volta sola per
 * ciascuna. "Non posso più" non annulla nulla da sé (c'è di mezzo
 * l'acconto): al cliente torna il link che apre subito "Proponi un'altra
 * data", oppure si annulla. "Ho sbagliato" toglie la risposta, perché si
 * può premere per errore (Luca).
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
    this.whatsAppService.onBookingReply((input) =>
      this.reply({ ...input, channel: "WHATSAPP" }),
    );
  }

  async reply(input: {
    clientId: string;
    bookingId: string;
    action: BookingReplyAction;
    now: Date;
    channel: BookingReplyChannel;
  }): Promise<Reply> {
    const booking = await this.prisma.booking.findUnique({
      where: { id: input.bookingId },
      select: {
        ...DEPOSIT_DEADLINE_SELECT,
        clientId: true,
        status: true,
        clientConfirmedAt: true,
        clientCantComeAt: true,
        professionalProfileId: true,
        professionalProfile: { select: { userId: true, businessName: true } },
        quote: {
          select: { guidedRequestId: true, lateCancelKeepsDeposit: true },
        },
      },
    });
    if (!booking || booking.clientId !== input.clientId) return null;
    const guidedRequestId = booking.quote?.guidedRequestId ?? null;
    const requestUrl = clientRequestUrl(guidedRequestId);
    const whatsApp = input.channel === "WHATSAPP";
    if (
      booking.status !== "CONFIRMED" ||
      booking.scheduledAt.getTime() <= wallClockNow(input.now).getTime()
    ) {
      // Dall'email la pagina dice già che l'appuntamento non c'è più.
      if (
        !whatsApp ||
        input.action === "UNDO_CONFIRM" ||
        input.action === "UNDO_CANT_COME"
      )
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
    const where = whatsApp ? "su WhatsApp" : "dall'email del promemoria";
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
          data: {
            clientConfirmedAt: input.now,
            clientCantComeAt: null,
            clientReplyChannel: input.channel,
          },
        });
        if (first.count === 0) return null;
        await log(`Il cliente ha confermato ${where} che ci sarà.`);
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
          data: {
            clientCantComeAt: input.now,
            clientConfirmedAt: null,
            clientReplyChannel: input.channel,
          },
        });
        if (first.count === 0) return null;
        await log(
          `Il cliente ha risposto al promemoria ${where} che non può più esserci.`,
        );
        await notify("BOOKING_CLIENT_CANT_COME");
        const deadline = depositDeadline(booking, input.now);
        return {
          text: [
            `Abbiamo avvisato ${name}. Per proporre un'altra data apri la tua richiesta: ${clientRequestUrl(guidedRequestId, { changeDate: true })}`,
            deadline
              ? `Se invece annulli entro ${whatsappDayTime(deadline)}, l'acconto ti torna indietro.`
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

  /** Pagina del link nell'email: l'appuntamento e la risposta già data. */
  async state(bookingId: string, now: Date): Promise<AppointmentReplyState> {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      select: {
        ...DEPOSIT_DEADLINE_SELECT,
        status: true,
        scheduledEndAt: true,
        clientConfirmedAt: true,
        clientCantComeAt: true,
        professionalProfile: { select: { businessName: true } },
        quote: {
          select: { guidedRequestId: true, lateCancelKeepsDeposit: true },
        },
      },
    });
    if (!booking) throw new NotFoundException("Appuntamento non trovato.");
    const upcoming =
      booking.status === "CONFIRMED" &&
      booking.scheduledAt.getTime() > wallClockNow(now).getTime();
    const deadline = upcoming ? depositDeadline(booking, now) : null;
    return {
      businessName: booking.professionalProfile.businessName,
      scheduledAt: booking.scheduledAt.toISOString(),
      scheduledEndAt: booking.scheduledEndAt?.toISOString() ?? null,
      upcoming,
      confirmedAt: booking.clientConfirmedAt?.toISOString() ?? null,
      cantComeAt: booking.clientCantComeAt?.toISOString() ?? null,
      depositDeadline: deadline?.toISOString() ?? null,
      guidedRequestId: booking.quote?.guidedRequestId ?? null,
    };
  }

  /** Risposta dai pulsanti dell'email: il cliente è quello del lavoro firmato nel link. */
  async replyFromEmail(
    bookingId: string,
    action: BookingReplyAction,
    now: Date,
  ): Promise<AppointmentReplyState> {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      select: { clientId: true },
    });
    if (!booking) throw new NotFoundException("Appuntamento non trovato.");
    await this.reply({
      clientId: booking.clientId,
      bookingId,
      action,
      now,
      channel: "EMAIL",
    });
    return this.state(bookingId, now);
  }
}
