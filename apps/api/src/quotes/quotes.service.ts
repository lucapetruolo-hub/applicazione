import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, type PrismaClient } from "@professionisti/database";
import type { ProposeQuoteDateInput, QuoteSelfInput } from "@professionisti/shared";
import { PRISMA } from "../prisma/prisma.module";
import { NotificationsService } from "../notifications/notifications.service";

@Injectable()
export class QuotesService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly notificationsService: NotificationsService,
  ) {}

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
      include: { guidedRequest: true },
    });
    if (!lead) {
      throw new ForbiddenException("Non hai ricevuto questa richiesta.");
    }

    const existingQuote = await this.prisma.quote.findFirst({
      where: { guidedRequestId: input.requestId, professionalProfileId: professionalProfile.id },
    });
    // Modificabile solo finché il cliente non ha ancora agito (richiesta
    // esplicita dell'utente: "Modifica preventivo" nella dashboard) — un
    // preventivo già accettato/rifiutato/ritirato/con una data proposta in
    // sospeso ha un ciclo di vita separato (rispettivamente: già prenotato,
    // QuotesService.rejectByClient/withdrawByProfessional,
    // proposeDate/confirmProposedDate/rejectProposedDate), riscriverlo qui
    // sotto lo confonderebbe con l'altra parte.
    if (existingQuote && existingQuote.status !== "SENT") {
      throw new ForbiddenException("Questo preventivo non è più modificabile da qui.");
    }

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

    // Solo al primo invio (non ad ogni modifica successiva): il cliente ha
    // già visto il preventivo la prima volta, una modifica non è "novità"
    // da badge — coerente con la stessa distinzione già fatta altrove nel
    // progetto (es. isNewUser per l'auth Google).
    if (!existingQuote) {
      await this.notificationsService.notify(lead.guidedRequest.clientId, "NEW_QUOTE", {
        guidedRequestId: lead.guidedRequestId,
        quoteId: quote.id,
        businessName: professionalProfile.businessName,
      });
    } else if (existingQuote.estimatedStartDate.getTime() !== data.estimatedStartDate.getTime()) {
      // Richiesta esplicita dell'utente: se il professionista modifica un
      // preventivo già inviato cambiando la data/orario, il cliente deve
      // saperlo — a differenza delle altre modifiche (voci, note), che
      // restano silenziose perché non cambiano "quando" arriva il
      // professionista, il dato che il cliente ha già visto e su cui può
      // aver già preso decisioni.
      await this.notificationsService.notify(lead.guidedRequest.clientId, "QUOTE_DATE_CHANGED", {
        guidedRequestId: lead.guidedRequestId,
        quoteId: quote.id,
        businessName: professionalProfile.businessName,
      });
    }

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
      include: { guidedRequest: true, booking: true, professionalProfile: true },
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
      data: { clientProposedDate: proposedDate, clientProposedNote: input.note?.trim() || null, status: "MODIFICATION_REQUESTED" },
    });
    await this.notificationsService.notify(quote.professionalProfile.userId, "QUOTE_DATE_PROPOSED", {
      guidedRequestId: quote.guidedRequestId,
      quoteId: quote.id,
    });
    return {
      id: updated.id,
      status: updated.status,
      clientProposedDate: updated.clientProposedDate?.toISOString() ?? null,
      clientProposedNote: updated.clientProposedNote,
    };
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
    const timeStr = scheduledAt.toISOString().slice(11, 16);
    const dayOfWeek = scheduledAt.getUTCDay();

    // Fascia sottostante (per conoscere la capienza reale, maxBookings):
    // il proposedDate è solo un timestamp esatto, non porta con sé
    // start/endTime — recuperata qui con lo stesso bounds-check già in uso
    // altrove (slotAppliesOnDate). Bug reale corretto insieme a
    // resolveFreeExactSlot sopra: senza, confermare una proposta su una
    // fascia a capienza (maxBookings > 1) sarebbe stato bloccato appena
    // fosse esistita UNA sola prenotazione precedente sulla stessa
    // fascia, anche con capienza ancora residua.
    const candidateSlots = await this.prisma.availabilitySlot.findMany({
      where: { professionalProfileId: professionalProfile.id, OR: [{ date: dayStart }, { date: null, dayOfWeek }] },
    });
    const matchingSlot = candidateSlots.find((s) => timeStr >= s.startTime && timeStr < s.endTime);
    const maxBookings = matchingSlot?.maxBookings ?? 1;

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
          const bookedCount = existingBookings.filter((b) => b.scheduledAt.getTime() === scheduledAt.getTime()).length;
          if (bookedCount >= maxBookings) {
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
          await tx.guidedRequest.update({ where: { id: quote.guidedRequestId }, data: { status: "CLOSED", closedReason: "COMPLETED" } });
          return created;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
      await this.notificationsService.notify(quote.guidedRequest.clientId, "QUOTE_DATE_CONFIRMED", {
        guidedRequestId: quote.guidedRequestId,
        quoteId: quote.id,
      });
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
    const quote = await this.prisma.quote.findUnique({ where: { id: quoteId }, include: { guidedRequest: true } });
    if (!quote || quote.professionalProfileId !== professionalProfile.id) {
      throw new ForbiddenException("Questo preventivo non è tuo.");
    }
    if (quote.status !== "MODIFICATION_REQUESTED") {
      throw new ForbiddenException("Nessuna data proposta da rifiutare per questo preventivo.");
    }
    const updated = await this.prisma.quote.update({
      where: { id: quote.id },
      data: { status: "SENT", clientProposedDate: null, clientProposedNote: null },
    });
    await this.notificationsService.notify(quote.guidedRequest.clientId, "QUOTE_DATE_REJECTED", {
      guidedRequestId: quote.guidedRequestId,
      quoteId: quote.id,
    });
    return { id: updated.id, status: updated.status };
  }

  /**
   * Il cliente rifiuta interamente un preventivo ricevuto (richiesta
   * esplicita dell'utente: "dai l'opzione per rifiutare oltre ad
   * accettarlo") — distinto dal rifiuto di una singola data proposta
   * (rejectProposedDate, che riguarda solo il sotto-flusso di modifica
   * data): qui il preventivo stesso non va più bene, non solo la data.
   */
  async rejectByClient(clientId: string, quoteId: string) {
    const quote = await this.prisma.quote.findUnique({
      where: { id: quoteId },
      include: { guidedRequest: true, booking: true, professionalProfile: true },
    });
    if (!quote) {
      throw new NotFoundException("Preventivo non trovato.");
    }
    if (quote.guidedRequest.clientId !== clientId) {
      throw new ForbiddenException("Questo preventivo non è associato a una tua richiesta.");
    }
    if (quote.booking || quote.status === "ACCEPTED" || quote.status === "REJECTED" || quote.status === "WITHDRAWN") {
      throw new ForbiddenException("Questo preventivo non è più modificabile.");
    }
    const updated = await this.prisma.quote.update({
      where: { id: quote.id },
      data: { status: "REJECTED", clientProposedDate: null, clientProposedNote: null },
    });
    // Bug reale corretto durante la verifica: notify() richiede lo userId
    // del destinatario, non il professionalProfileId (chiave esterna
    // diversa) — passarlo per errore causava un 500 (violazione vincolo di
    // chiave esterna su Notification.userId) invece di notificare.
    await this.notificationsService.notify(quote.professionalProfile.userId, "QUOTE_REJECTED", {
      guidedRequestId: quote.guidedRequestId,
      quoteId: quote.id,
    });
    return { id: updated.id, status: updated.status };
  }

  /**
   * Il professionista ritira un preventivo già inviato, prima che il
   * cliente lo accetti (richiesta esplicita dell'utente) — stato distinto
   * da REJECTED (quello significa "il cliente lo ha rifiutato") perché il
   * messaggio mostrato all'altra parte dev'essere diverso a seconda di chi
   * ha agito.
   */
  async withdrawByProfessional(professionalUserId: string, quoteId: string) {
    const professionalProfile = await this.prisma.professionalProfile.findUnique({ where: { userId: professionalUserId } });
    if (!professionalProfile) {
      throw new NotFoundException("Profilo professionista non trovato.");
    }
    const quote = await this.prisma.quote.findUnique({ where: { id: quoteId }, include: { guidedRequest: true, booking: true } });
    if (!quote || quote.professionalProfileId !== professionalProfile.id) {
      throw new ForbiddenException("Questo preventivo non è tuo.");
    }
    if (quote.booking || quote.status === "ACCEPTED" || quote.status === "REJECTED" || quote.status === "WITHDRAWN") {
      throw new ForbiddenException("Questo preventivo non è più modificabile.");
    }
    const updated = await this.prisma.quote.update({
      where: { id: quote.id },
      data: { status: "WITHDRAWN", clientProposedDate: null, clientProposedNote: null },
    });
    await this.notificationsService.notify(quote.guidedRequest.clientId, "QUOTE_WITHDRAWN", {
      guidedRequestId: quote.guidedRequestId,
      quoteId: quote.id,
    });
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
      // Corrisponde sia a una fascia legata a questa data esatta sia a una
      // fascia ricorrente (date=null, comportamento storico) per lo stesso
      // giorno della settimana — vedi slotAppliesOnDate (apps/api/src/common).
      // Nessun filtro su `maxBookings`: bug reale corretto (il cliente non
      // vedeva mai date da proporre se il professionista aveva impostato
      // l'agenda solo con fasce a capienza) — stessa scelta già fatta per
      // ProfessionalsService.getMyAvailableSlots, qui si sta scegliendo
      // quando iniziare un lavoro già concordato, non consumando la
      // capienza pensata per il fan-out delle richieste guidate.
      this.prisma.availabilitySlot.findFirst({
        where: { professionalProfileId, startTime, endTime, OR: [{ date }, { date: null, dayOfWeek }] },
      }),
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
    // Conteggio invece di un semplice booleano: una fascia a capienza
    // (maxBookings > 1) può ospitare più prenotazioni sulla stessa
    // data+ora, non solo una — stesso principio di countBookingsInSlot già
    // in uso in ProfessionalsService per bookedCount.
    const bookedCount = existingBookings.filter((b) => b.scheduledAt.getTime() === scheduledAt.getTime()).length;
    if (bookedCount >= slot.maxBookings) {
      throw new ConflictException("Questa fascia è già stata prenotata.");
    }

    return scheduledAt;
  }
}
