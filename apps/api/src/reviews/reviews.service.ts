import { ConflictException, ForbiddenException, Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import type { PrismaClient } from "@professionisti/database";
import type { ReviewInput } from "@professionisti/shared";
import { PRISMA } from "../prisma/prisma.module";
import { ProfessionalMetricsService } from "../professional-metrics/professional-metrics.service";

// Recensioni "doppio cieco" (richiesta esplicita dell'utente): pubbliche
// solo quando entrambe le parti hanno recensito, a meno che non passino
// questi giorni di attesa — a quel punto la controparte mancante riceve una
// recensione automatica a 5 stelle (mostrata con l'etichetta "(recensione
// automatica)"), che sblocca comunque quella già scritta.
const AUTO_REVIEW_AFTER_DAYS = 3;

@Injectable()
export class ReviewsService {
  private readonly logger = new Logger(ReviewsService.name);

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly professionalMetricsService: ProfessionalMetricsService,
  ) {}

  /**
   * Ultime recensioni pubbliche della piattaforma (sezione riprova sociale
   * in home). Stesso filtro "doppio cieco" del profilo pubblico: visibili
   * solo se esiste anche la ClientReview sullo stesso booking. Demo esclusi
   * (come le statistiche pubbliche, StatsService). Nessun dato inventato:
   * se non ce ne sono, la home non mostra proprio la sezione.
   */
  async getRecentPublic(limit = 6) {
    const reviews = await this.prisma.review.findMany({
      where: {
        booking: {
          clientReview: { isNot: null },
          professionalProfile: { isDemo: false, deletedAt: null },
        },
      },
      include: {
        booking: {
          include: {
            professionalProfile: { include: { category: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    return reviews.map((review) => ({
      id: review.id,
      rating: review.rating,
      // Le automatiche (5 stelle per controparte assente) non hanno testo
      // libero: l'etichetta "(recensione automatica)" la mette il frontend,
      // come già nella pagina profilo pubblica.
      comment: review.isAutomatic ? null : review.comment,
      isAutomatic: review.isAutomatic,
      createdAt: review.createdAt.toISOString(),
      professional: {
        businessName: review.booking.professionalProfile.businessName,
        categoryLabel: review.booking.professionalProfile.category.label,
        // Slug categoria (non solo l'etichetta) per il fallback visivo lato
        // home quando il professionista non ha un'immagine profilo —
        // richiesta esplicita dell'utente: "fai comparire anche la foto
        // del professionista... grande quanto tutto il riquadro".
        categorySlug: review.booking.professionalProfile.category.slug,
        city: review.booking.professionalProfile.city,
        imageUrl: review.booking.professionalProfile.imageUrl,
      },
    }));
  }

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
    // Il cliente deve prima confermare dal proprio lato che il lavoro è
    // davvero terminato (richiesta esplicita dell'utente: "servono i
    // completed da entrambi... le recensioni saranno subito effettuabili"
    // — subito dopo la PROPRIA conferma, non prima).
    if (!booking.clientConfirmedCompletedAt) {
      throw new ForbiddenException("Conferma prima che il lavoro è terminato dal tuo lato.");
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

  /**
   * Sblocco automatico "doppio cieco" (richiesta esplicita dell'utente):
   * se una recensione esiste da più di AUTO_REVIEW_AFTER_DAYS giorni senza
   * la controparte sull'altro lato, genera quella mancante a 5 stelle
   * (isAutomatic: true) — così entrambe risultano presenti e la coppia
   * diventa pubblica (vedi il filtro "entrambe esistono" in
   * ProfessionalsService.search/getById).
   */
  @Cron(CronExpression.EVERY_HOUR)
  async runAutoPublishCheck(): Promise<void> {
    const threshold = new Date(Date.now() - AUTO_REVIEW_AFTER_DAYS * 24 * 60 * 60 * 1000);

    const staleReviews = await this.prisma.review.findMany({
      where: { isAutomatic: false, createdAt: { lt: threshold }, booking: { clientReview: { is: null } } },
      include: { booking: true },
    });
    for (const review of staleReviews) {
      await this.prisma.clientReview.create({
        data: { bookingId: review.bookingId, clientId: review.booking.clientId, rating: 5, isAutomatic: true, mediaUrls: [] },
      });
    }

    const staleClientReviews = await this.prisma.clientReview.findMany({
      where: { isAutomatic: false, createdAt: { lt: threshold }, booking: { review: { is: null } } },
    });
    for (const clientReview of staleClientReviews) {
      await this.prisma.review.create({
        data: { bookingId: clientReview.bookingId, rating: 5, isAutomatic: true, photoUrls: [] },
      });
    }

    if (staleReviews.length > 0 || staleClientReviews.length > 0) {
      this.logger.log(
        `Recensioni automatiche generate: ${staleReviews.length} lato cliente→professionista mancanti, ${staleClientReviews.length} lato professionista→cliente mancanti.`,
      );
    }
  }
}
