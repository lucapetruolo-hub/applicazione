import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { PrismaClient } from "@professionisti/database";
import {
  wallClockNow,
  type RejectRescheduleInput,
  type RescheduleBookingInput,
} from "@professionisti/shared";
import { PRISMA } from "../prisma/prisma.module";
import { NotificationsService } from "../notifications/notifications.service";
import { TimelineService } from "../timeline/timeline.service";
import { WhatsAppService } from "../whatsapp/whatsapp.service";
import { whatsappDayTime } from "../whatsapp/whatsapp-templates";

const DAY_MS = 24 * 60 * 60 * 1000;

const BOOKING_SELECT = {
  id: true,
  clientId: true,
  status: true,
  scheduledAt: true,
  scheduledEndAt: true,
  clientCantComeAt: true,
  rescheduleProposedAt: true,
  rescheduleProposedEndAt: true,
  rescheduleNote: true,
  professionalProfileId: true,
  professionalProfile: { select: { userId: true } },
  quote: { select: { guidedRequestId: true } },
} as const;

/** Nuovo inizio e fine: stessa durata in giorni dell'appuntamento di adesso. */
export function rescheduledSpan(
  current: { scheduledAt: Date; scheduledEndAt: Date | null },
  input: Pick<RescheduleBookingInput, "date" | "startTime" | "endTime">,
): { start: Date; end: Date } {
  const start = new Date(`${input.date}T${input.startTime}:00.000Z`);
  const firstDayEnd = new Date(`${input.date}T${input.endTime}:00.000Z`);
  const days = current.scheduledEndAt
    ? Math.max(
        0,
        Math.round(
          (Date.UTC(
            current.scheduledEndAt.getUTCFullYear(),
            current.scheduledEndAt.getUTCMonth(),
            current.scheduledEndAt.getUTCDate(),
          ) -
            Date.UTC(
              current.scheduledAt.getUTCFullYear(),
              current.scheduledAt.getUTCMonth(),
              current.scheduledAt.getUTCDate(),
            )) /
            DAY_MS,
        ),
      )
    : 0;
  return { start, end: new Date(firstDayEnd.getTime() + days * DAY_MS) };
}

/**
 * "Non posso più" → "Proponi un'altra data" (Luca, 29/10/2026,
 * docs/changelog/2026-10-28-promemoria-whatsapp.md): il cliente propone una
 * nuova data per l'appuntamento già fissato, invece di annullarlo. Il
 * professionista la accetta (l'appuntamento si sposta, con acconto e
 * pagamento com'erano) o la rifiuta (resta com'era). Nessun controllo
 * sull'agenda: decide il professionista, che la vede.
 */
@Injectable()
export class BookingRescheduleService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly notificationsService: NotificationsService,
    private readonly timelineService: TimelineService,
    private readonly whatsAppService: WhatsAppService,
  ) {}

  async propose(
    clientId: string,
    bookingId: string,
    input: RescheduleBookingInput,
    now: Date = new Date(),
  ): Promise<{ ok: true }> {
    const booking = await this.load(bookingId);
    if (booking.clientId !== clientId)
      throw new ForbiddenException("Questo appuntamento non è tuo.");
    this.assertUpcoming(booking, now);
    const { start, end } = rescheduledSpan(booking, input);
    if (input.endTime <= input.startTime)
      throw new BadRequestException(
        "L'ora di fine deve essere dopo l'ora di inizio.",
      );
    if (start.getTime() <= wallClockNow(now).getTime())
      throw new BadRequestException("Scegli una data che deve ancora venire.");
    if (
      start.getTime() === booking.scheduledAt.getTime() &&
      end.getTime() === (booking.scheduledEndAt ?? start).getTime()
    )
      throw new BadRequestException(
        "È la data dell'appuntamento: scegline un'altra.",
      );
    const note = input.note?.trim() || null;
    await this.prisma.booking.update({
      where: { id: bookingId },
      data: {
        rescheduleProposedAt: start,
        rescheduleProposedEndAt: end,
        rescheduleNote: note,
        rescheduleRequestedAt: now,
        // Proporre un'altra data vuol dire che a quella di adesso non c'è.
        clientConfirmedAt: null,
        ...(booking.clientCantComeAt ? {} : { clientCantComeAt: now }),
      },
    });
    await this.log(
      booking,
      "CLIENT",
      `Il cliente non può più esserci e propone di spostare l'appuntamento a ${whatsappDayTime(start)}.${note ? ` Nota: "${note}"` : ""}`,
    );
    await this.notificationsService.notify(
      booking.professionalProfile.userId,
      "BOOKING_RESCHEDULE_PROPOSED",
      {
        ...this.payload(booking),
        from: this.slot(booking.scheduledAt, booking.scheduledEndAt),
        to: this.slot(start, end),
        ...(note ? { note } : {}),
      },
    );
    return { ok: true };
  }

  async accept(
    professionalUserId: string,
    bookingId: string,
    now: Date = new Date(),
  ): Promise<{ ok: true }> {
    const booking = await this.load(bookingId);
    this.assertProfessional(booking, professionalUserId);
    this.assertUpcoming(booking, now);
    const start = booking.rescheduleProposedAt;
    const end = booking.rescheduleProposedEndAt;
    if (!start) throw new BadRequestException("Nessuna data da accettare.");
    if (start.getTime() <= wallClockNow(now).getTime())
      throw new BadRequestException(
        "La data proposta è già passata: chiedi al cliente di proporne un'altra.",
      );
    const moved = await this.prisma.booking.updateMany({
      where: {
        id: bookingId,
        rescheduleProposedAt: start,
        status: "CONFIRMED",
      },
      data: {
        scheduledAt: start,
        scheduledEndAt: end,
        rescheduleProposedAt: null,
        rescheduleProposedEndAt: null,
        rescheduleNote: null,
        rescheduleRequestedAt: null,
        // Nuova data, promemoria e risposte da capo.
        reminderSentAt: null,
        clientDepositReminderAt: null,
        clientConfirmedAt: null,
        clientCantComeAt: null,
        clientReplyChannel: null,
      },
    });
    if (moved.count === 0)
      throw new BadRequestException(
        "La proposta è cambiata: ricarica la pagina.",
      );
    await this.whatsAppService.forgetBookingReminders(bookingId, now);
    await this.log(
      booking,
      "PROFESSIONAL",
      `Il professionista ha accettato la nuova data: l'appuntamento è spostato a ${whatsappDayTime(start)}.`,
    );
    await this.notificationsService.notify(
      booking.clientId,
      "BOOKING_RESCHEDULE_ACCEPTED",
      {
        ...this.payload(booking),
        from: this.slot(booking.scheduledAt, booking.scheduledEndAt),
        to: this.slot(start, end),
      },
    );
    return { ok: true };
  }

  async reject(
    professionalUserId: string,
    bookingId: string,
    input: RejectRescheduleInput,
  ): Promise<{ ok: true }> {
    const booking = await this.load(bookingId);
    this.assertProfessional(booking, professionalUserId);
    const start = booking.rescheduleProposedAt;
    if (!start) throw new BadRequestException("Nessuna data da rifiutare.");
    await this.prisma.booking.update({
      where: { id: bookingId },
      data: {
        rescheduleProposedAt: null,
        rescheduleProposedEndAt: null,
        rescheduleNote: null,
        rescheduleRequestedAt: null,
      },
    });
    const note = input.note?.trim() || null;
    await this.log(
      booking,
      "PROFESSIONAL",
      `Il professionista non può ${whatsappDayTime(start)}: l'appuntamento resta com'era.${note ? ` Nota: "${note}"` : ""}`,
    );
    await this.notificationsService.notify(
      booking.clientId,
      "BOOKING_RESCHEDULE_REJECTED",
      {
        ...this.payload(booking),
        from: this.slot(booking.scheduledAt, booking.scheduledEndAt),
        to: this.slot(start, booking.rescheduleProposedEndAt),
        ...(note ? { note } : {}),
      },
    );
    return { ok: true };
  }

  private async load(bookingId: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      select: BOOKING_SELECT,
    });
    if (!booking) throw new NotFoundException("Appuntamento non trovato.");
    return booking;
  }

  private assertProfessional(
    booking: { professionalProfile: { userId: string } },
    userId: string,
  ): void {
    if (booking.professionalProfile.userId !== userId)
      throw new ForbiddenException("Questo appuntamento non è tuo.");
  }

  private assertUpcoming(
    booking: { status: string; scheduledAt: Date },
    now: Date,
  ): void {
    if (
      booking.status !== "CONFIRMED" ||
      booking.scheduledAt.getTime() <= wallClockNow(now).getTime()
    )
      throw new BadRequestException(
        "Questo appuntamento non si può più spostare.",
      );
  }

  private slot(start: Date, end: Date | null) {
    return { start: start.toISOString(), end: end?.toISOString() ?? null };
  }

  private payload(booking: {
    id: string;
    professionalProfileId: string;
    quote: { guidedRequestId: string } | null;
  }) {
    const guidedRequestId = booking.quote?.guidedRequestId ?? null;
    return {
      bookingId: booking.id,
      ...(guidedRequestId
        ? {
            guidedRequestId,
            professionalProfileId: booking.professionalProfileId,
          }
        : {}),
    };
  }

  private log(
    booking: {
      professionalProfileId: string;
      quote: { guidedRequestId: string } | null;
    },
    actor: "CLIENT" | "PROFESSIONAL",
    message: string,
  ): Promise<void> {
    const guidedRequestId = booking.quote?.guidedRequestId;
    return guidedRequestId
      ? this.timelineService.log(
          guidedRequestId,
          booking.professionalProfileId,
          actor,
          message,
        )
      : Promise.resolve();
  }
}
