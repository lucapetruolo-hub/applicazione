import { ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { PrismaClient } from "@professionisti/database";
import type { AcceptQuoteInput } from "@professionisti/shared";
import { PRISMA } from "../prisma/prisma.module";

@Injectable()
export class BookingsService {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  /**
   * Il cliente accetta un preventivo: crea la prenotazione, chiude la
   * richiesta e salva l'indirizzo di lavoro strutturato raccolto nella
   * schermata di accettazione (richiesta esplicita dell'utente) — sostituisce,
   * per le prenotazioni create da qui in avanti, l'indirizzo libero di
   * GuidedRequest.address come fonte principale mostrata al professionista.
   */
  async createFromQuote(clientId: string, quoteId: string, address: AcceptQuoteInput) {
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
    if (quote.booking) {
      throw new ForbiddenException("Questo preventivo è già stato accettato.");
    }

    const booking = await this.prisma.booking.create({
      data: {
        quoteId: quote.id,
        clientId,
        professionalProfileId: quote.professionalProfileId,
        scheduledAt: quote.estimatedStartDate,
        status: "CONFIRMED",
        recipientName: address.recipientName.trim(),
        recipientSurname: address.recipientSurname.trim(),
        recipientPhone: address.recipientPhone.trim(),
        street: address.street.trim(),
        houseNumber: address.houseNumber.trim(),
        addressExtra: address.addressExtra?.trim() || null,
        postalCode: address.postalCode.trim(),
        city: address.city.trim(),
        province: address.province.trim(),
      },
    });

    await this.prisma.quote.update({ where: { id: quote.id }, data: { status: "ACCEPTED" } });
    await this.prisma.guidedRequest.update({ where: { id: quote.guidedRequestId }, data: { status: "CLOSED" } });

    return { bookingId: booking.id };
  }

  /**
   * Il professionista conferma, completa o annulla una prenotazione.
   * CONFIRMED serve soprattutto alle prenotazioni dirette dall'agenda
   * pubblica (bookAgendaSlot le crea come PENDING, vedi
   * ProfessionalsService): prima di questo cambio non esisteva alcuna azione
   * per farle avanzare, restavano PENDING per sempre — bug reale, la
   * dashboard mostrava il bottone "Segna come completato" solo per lo stato
   * CONFIRMED.
   */
  async updateStatus(professionalUserId: string, bookingId: string, status: "CONFIRMED" | "COMPLETED" | "CANCELED" | "NO_SHOW") {
    const professionalProfile = await this.prisma.professionalProfile.findUnique({ where: { userId: professionalUserId } });
    if (!professionalProfile) {
      throw new NotFoundException("Profilo professionista non trovato.");
    }

    const booking = await this.prisma.booking.findUnique({ where: { id: bookingId } });
    if (!booking || booking.professionalProfileId !== professionalProfile.id) {
      throw new ForbiddenException("Questa prenotazione non è tua.");
    }
    if (booking.status === "COMPLETED" || booking.status === "CANCELED") {
      throw new ForbiddenException("Questa prenotazione è già conclusa.");
    }

    await this.prisma.booking.update({ where: { id: bookingId }, data: { status } });
    return { bookingId, status };
  }

  /**
   * Il cliente annulla una propria prenotazione ancora attiva (PENDING o
   * CONFIRMED). Prima di questo endpoint un cliente che prenotava
   * direttamente una fascia dall'agenda pubblica (bookAgendaSlot) non aveva
   * alcun modo di disdire — solo il professionista poteva farlo.
   */
  async cancelForClient(clientId: string, bookingId: string) {
    const booking = await this.prisma.booking.findUnique({ where: { id: bookingId } });
    if (!booking || booking.clientId !== clientId) {
      throw new ForbiddenException("Questa prenotazione non è tua.");
    }
    if (booking.status !== "PENDING" && booking.status !== "CONFIRMED") {
      throw new ForbiddenException("Questa prenotazione non può più essere annullata.");
    }

    await this.prisma.booking.update({ where: { id: bookingId }, data: { status: "CANCELED" } });
    return { bookingId, status: "CANCELED" as const };
  }

  /** Prenotazioni del cliente autenticato, per proporre la recensione a lavoro completato. */
  async listForClient(clientId: string) {
    const bookings = await this.prisma.booking.findMany({
      where: { clientId },
      include: { professionalProfile: true, review: true },
      orderBy: { scheduledAt: "desc" },
    });

    return bookings.map((booking) => ({
      id: booking.id,
      scheduledAt: booking.scheduledAt.toISOString(),
      status: booking.status,
      businessName: booking.professionalProfile.businessName,
      professionalProfileId: booking.professionalProfileId,
      hasReview: booking.review !== null,
    }));
  }
}
