import { ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { PrismaClient } from "@professionisti/database";
import type { ReviewInput } from "@professionisti/shared";
import { PRISMA } from "../prisma/prisma.module";
import { ProfessionalMetricsService } from "../professional-metrics/professional-metrics.service";

@Injectable()
export class ReviewsService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly professionalMetricsService: ProfessionalMetricsService,
  ) {}

  async create(clientId: string, input: ReviewInput) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: input.bookingId },
      include: { review: true },
    });
    if (!booking) {
      throw new NotFoundException("Prenotazione non trovata.");
    }
    if (booking.clientId !== clientId) {
      throw new ForbiddenException("Questa prenotazione non è tua.");
    }
    // Recensione solo da prenotazione confermata/completata (CLAUDE.md §8):
    // niente recensioni libere, per credibilità del sistema reputazionale.
    if (booking.status !== "COMPLETED") {
      throw new ForbiddenException("Puoi recensire solo un lavoro completato.");
    }
    if (booking.review) {
      throw new ConflictException("Hai già recensito questa prenotazione.");
    }

    const review = await this.prisma.review.create({
      data: { bookingId: input.bookingId, rating: input.rating, comment: input.comment, photoUrls: input.photoUrls },
    });

    // Metriche di affidabilità (CLAUDE.md §15, evento 5).
    await this.professionalMetricsService.recordReview(booking.professionalProfileId, input.rating);

    return { id: review.id };
  }
}
