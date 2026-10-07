import { ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { PrismaClient } from "@professionisti/database";
import type { ClientReviewInput } from "@professionisti/shared";
import { PRISMA } from "../prisma/prisma.module";

/**
 * Recensione del professionista sul cliente (richiesta esplicita
 * dell'utente: "per il professionista per fare una recensione al
 * cliente") — stesso vincolo "solo da lavoro completato" di ReviewsService,
 * ma dal lato opposto. Nessuna metrica di affidabilità collegata (quelle,
 * CLAUDE.md §15, misurano il professionista, non il cliente).
 */
@Injectable()
export class ClientReviewsService {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  /**
   * Recensioni ricevute dal cliente stesso, per la scheda "Recensioni" del
   * suo account (decisione dell'utente, docs/CHANGELOG.md §179). Stesso
   * filtro della scheda cliente vista dal professionista
   * (ProfessionalsService): niente recensioni nascoste da un admin, e solo
   * quelle già sbloccate dal "doppio cieco" (il cliente ha recensito a sua
   * volta, o è scattata la recensione automatica).
   */
  async listMine(clientId: string) {
    const reviews = await this.prisma.clientReview.findMany({
      where: { clientId, hiddenAt: null, booking: { review: { isNot: null } } },
      include: { booking: { include: { professionalProfile: { select: { businessName: true } } } } },
      orderBy: { createdAt: "desc" },
    });
    return reviews.map((review) => ({
      id: review.id,
      rating: review.rating,
      comment: review.comment,
      mediaUrls: review.mediaUrls,
      createdAt: review.createdAt.toISOString(),
      isAutomatic: review.isAutomatic,
      reviewerBusinessName: review.booking.professionalProfile.businessName,
    }));
  }

  async create(professionalUserId: string, input: ClientReviewInput) {
    const professionalProfile = await this.prisma.professionalProfile.findUnique({ where: { userId: professionalUserId } });
    if (!professionalProfile) {
      throw new NotFoundException("Profilo professionista non trovato.");
    }

    const booking = await this.prisma.booking.findUnique({
      where: { id: input.bookingId },
      include: { clientReview: true },
    });
    if (!booking || booking.professionalProfileId !== professionalProfile.id) {
      throw new ForbiddenException("Questa prenotazione non è tua.");
    }
    // Recensione consentita non appena il professionista stesso ha
    // segnalato il lavoro come terminato (la sua stessa azione di
    // completamento È già la sua conferma — a differenza del cliente, che
    // deve confermare esplicitamente dal proprio lato, vedi
    // ReviewsService.create).
    if (booking.status !== "COMPLETED") {
      throw new ForbiddenException("Puoi recensire solo un lavoro completato.");
    }
    if (booking.clientReview) {
      throw new ConflictException("Hai già recensito questo cliente per questa prenotazione.");
    }

    const review = await this.prisma.clientReview.create({
      data: {
        bookingId: input.bookingId,
        clientId: booking.clientId,
        rating: input.rating,
        comment: input.comment,
        mediaUrls: input.mediaUrls,
      },
    });

    return { id: review.id };
  }
}
