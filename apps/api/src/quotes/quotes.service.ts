import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, type PrismaClient } from "@professionisti/database";
import type { ProposeQuoteDateInput, QuoteSelfInput } from "@professionisti/shared";
import { PRISMA } from "../prisma/prisma.module";

@Injectable()
export class QuotesService {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  async createOrUpdate(userId: string, input: QuoteSelfInput) {
    const professionalProfile = await this.prisma.professionalProfile.findUnique({ where: { userId } });
    if (!professionalProfile) {
      throw new NotFoundException("Completa prima il tuo profilo professionista.");
    }

    // Il preventivo si può inviare solo se il professionista ha ricevuto il
    // lead per questa richiesta (fan-out in guided-requests) — evita che
    // chiunque possa rispondere a richieste non sue (CLAUDE.md §8).
    const lead = await this.prisma.lead.findUnique({
      where: {
        guidedRequestId_professionalProfileId: {
          guidedRequestId: input.requestId,
          professionalProfileId: professionalProfile.id,
        },
      },
    });
    if (!lead) {
      throw new ForbiddenException("Non hai ricevuto questa richiesta.");
    }

    const existingQuote = await this.prisma.quote.findFirst({
      where: { guidedRequestId: input.requestId, professionalProfileId: professionalProfile.id },
    });

    const data = {
      estimatedStartDate: new Date(input.estimatedStartDate),
      notes: input.notes,
    };

    const quote = existingQuote
      ? await this.prisma.quote.update({ where: { id: existingQuote.id }, data })
      : await this.prisma.quote.create({
          data: {
            ...data,
            guidedRequestId: input.requestId,
            professionalProfileId: professionalProfile.id,
          },
        });

    // Voci sostituite per intero ad ogni invio/modifica del preventivo,
    // stesso pattern di ProfessionalService in ProfessionalsService.
    await this.prisma.quoteItem.deleteMany({ where: { quoteId: quote.id } });
    await this.prisma.quoteItem.createMany({
      data: input.items.map((item) => ({
        quoteId: quote.id,
        name: item.name,
        priceMinEurCents: item.priceMinEurCents ?? null,
        priceMaxEurCents: item.priceMaxEurCents ?? null,
      })),
    });

    return { id: quote.id, status: quote.status };
  }

  /**
   * Il cliente propone una data diversa da quella indicata dal
   * professionista, scelta tra le fasce esatte libere della sua agenda
   * (mai una data libera scollegata — validata comunque qui). Non crea
   * ancora una prenotazione: resta MODIFICATION_REQUESTED finché il
   * professionista non conferma (evita che due clienti "vincano" la stessa
   * fascia solo proponendola — la capienza va rivalidata alla conferma,
   * stessa cautela di bookAgendaSlot/resolveGenericSlot).
   */
  async proposeDate(clientId: string, quoteId: string, input: ProposeQuoteDateInput) {
    const quote = await this.prisma.quote.findUnique({
      where: { id: quoteId },
      include: { guidedRequest: true, booking: true },
    });
    if (!quote) {
      throw new NotFoundException("Preventivo non trovato.");
    }
    if (quote.guidedRequest.clientId !== clientId) {
      throw new ForbiddenException("Questo preventivo non è associato a una tua richiesta.");
    }
    if (quote.booking || quote.status === "ACCEPTED" || quote.status === "REJECTED") {
      throw new ForbiddenException("Questo preventivo non è più modificabile.");
    }

    const proposedDate = await this.resolveFreeExactSlot(quote.professionalProfileId, input.date, input.startTime, input.endTime);

    const updated = await this.prisma.quote.update({
      where: { id: quote.id },
      data: { clientProposedDate: proposedDate, status: "MODIFICATION_REQUESTED" },
    });
    return { id: updated.id, status: updated.status, clientProposedDate: updated.clientProposedDate?.toISOString() ?? null };
  }

  /**
   * Il professionista conferma la data proposta dal cliente: crea
   * direttamente la prenotazione (stesso esito finale di
   * BookingsService.createFromQuote, ma innescato da questo lato) dopo
   * aver rivalidato che la fascia sia ancora libera — stessa transazione
   * Serializable anti race-condition già in uso per bookAgendaSlot.
   */
  async confirmProposedDate(professionalUserId: string, quoteId: string) {
    const professionalProfile = await this.prisma.professionalProfile.findUnique({ where: { userId: professionalUserId } });
    if (!professionalProfile) {
      throw new NotFoundException("Profilo professionista non trovato.");
    }

    const quote = await this.prisma.quote.findUnique({ where: { id: quoteId }, include: { guidedRequest: true, booking: true } });
    if (!quote || quote.professionalProfileId !== professionalProfile.id) {
      throw new ForbiddenException("Questo preventivo non è tuo.");
    }
    if (quote.status !== "MODIFICATION_REQUESTED" || !quote.clientProposedDate) {
      throw new ForbiddenException("Nessuna data proposta da confermare per questo preventivo.");
    }
    if (quote.booking) {
      throw new ForbiddenException("Questo preventivo è già stato accettato.");
    }

    const scheduledAt = quote.clientProposedDate;
    const dayStart = new Date(scheduledAt);
    dayStart.setUTCHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

    try {
      const booking = await this.prisma.$transaction(
        async (tx) => {
          const existingBookings = await tx.booking.findMany({
            where: {
              professionalProfileId: professionalProfile.id,
              status: { in: ["PENDING", "CONFIRMED", "COMPLETED"] },
              scheduledAt: { gte: dayStart, lt: dayEnd },
            },
            select: { scheduledAt: true },
          });
          const slotTaken = existingBookings.some((b) => b.scheduledAt.getTime() === scheduledAt.getTime());
          if (slotTaken) {
            throw new ConflictException("Questa fascia non è più libera.");
          }
          const created = await tx.booking.create({
            data: {
              quoteId: quote.id,
              clientId: quote.guidedRequest.clientId,
              professionalProfileId: professionalProfile.id,
              scheduledAt,
              status: "CONFIRMED",
            },
          });
          await tx.quote.update({ where: { id: quote.id }, data: { status: "ACCEPTED", estimatedStartDate: scheduledAt } });
          await tx.guidedRequest.update({ where: { id: quote.guidedRequestId }, data: { status: "CLOSED" } });
          return created;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
      return { bookingId: booking.id };
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2034") {
        throw new ConflictException("Questa fascia non è più libera.");
      }
      throw err;
    }
  }

  /** Il professionista rifiuta la data proposta: il preventivo torna SENT con la data originale, il cliente può accettarla o proporne un'altra. */
  async rejectProposedDate(professionalUserId: string, quoteId: string) {
    const professionalProfile = await this.prisma.professionalProfile.findUnique({ where: { userId: professionalUserId } });
    if (!professionalProfile) {
      throw new NotFoundException("Profilo professionista non trovato.");
    }
    const quote = await this.prisma.quote.findUnique({ where: { id: quoteId } });
    if (!quote || quote.professionalProfileId !== professionalProfile.id) {
      throw new ForbiddenException("Questo preventivo non è tuo.");
    }
    if (quote.status !== "MODIFICATION_REQUESTED") {
      throw new ForbiddenException("Nessuna data proposta da rifiutare per questo preventivo.");
    }
    const updated = await this.prisma.quote.update({ where: { id: quote.id }, data: { status: "SENT", clientProposedDate: null } });
    return { id: updated.id, status: updated.status };
  }

  /**
   * Valida che date+startTime+endTime corrispondano a una fascia esatta
   * (maxBookings=1) realmente libera dell'agenda del professionista —
   * stessa cautela già applicata a bookAgendaSlot/resolveGenericSlot in
   * altri servizi, non fidarsi mai ciecamente di quanto inviato dal client.
   */
  private async resolveFreeExactSlot(professionalProfileId: string, dateStr: string, startTime: string, endTime: string): Promise<Date> {
    const date = new Date(`${dateStr}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException("Data non valida.");
    }
    const dayOfWeek = date.getUTCDay();

    const [slot, exception] = await Promise.all([
      this.prisma.availabilitySlot.findFirst({ where: { professionalProfileId, dayOfWeek, startTime, endTime, maxBookings: 1 } }),
      this.prisma.availabilityException.findUnique({ where: { professionalProfileId_date: { professionalProfileId, date } } }),
    ]);
    if (!slot) {
      throw new BadRequestException("Questa fascia oraria non fa parte dell'agenda del professionista.");
    }
    if (exception) {
      throw new ConflictException("Il professionista non è disponibile in questa data.");
    }

    const dayStart = new Date(date);
    const dayEnd = new Date(date);
    dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);
    const existingBookings = await this.prisma.booking.findMany({
      where: {
        professionalProfileId,
        status: { in: ["PENDING", "CONFIRMED", "COMPLETED"] },
        scheduledAt: { gte: dayStart, lt: dayEnd },
      },
      select: { scheduledAt: true },
    });
    const [hoursStr, minutesStr] = startTime.split(":");
    const scheduledAt = new Date(date);
    scheduledAt.setUTCHours(Number(hoursStr), Number(minutesStr), 0, 0);
    const slotTaken = existingBookings.some((b) => b.scheduledAt.getTime() === scheduledAt.getTime());
    if (slotTaken) {
      throw new ConflictException("Questa fascia è già stata prenotata.");
    }

    return scheduledAt;
  }
}
