import { ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { PrismaClient } from "@professionisti/database";
import { clientCanReview, type ReviewInput } from "@professionisti/shared";
import { PRISMA } from "../prisma/prisma.module";
import { ProfessionalMetricsService } from "../professional-metrics/professional-metrics.service";
import { NotificationsService } from "../notifications/notifications.service";
import { publicClientName } from "../common/client-name.util";

// Le recensioni del cliente sono pubbliche subito: il professionista non
// recensisce più il cliente e il "doppio cieco" non esiste più
// (docs/CHANGELOG.md §215).

@Injectable()
export class ReviewsService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly professionalMetricsService: ProfessionalMetricsService,
    private readonly notificationsService: NotificationsService,
  ) {}

  /**
   * Recensioni scritte dal cliente ai professionisti, per la scheda
   * /le-mie-recensioni (docs/CHANGELOG.md §180). `hidden` dice se un admin
   * le ha nascoste.
   */
  async listMine(clientId: string) {
    const reviews = await this.prisma.review.findMany({
      where: { booking: { clientId } },
      include: {
        booking: {
          select: {
            professionalProfile: { select: { id: true, businessName: true, deletedAt: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });
    return reviews.map((review) => ({
      id: review.id,
      rating: review.rating,
      comment: review.comment,
      mediaUrls: review.photoUrls,
      createdAt: review.createdAt.toISOString(),
      hidden: review.hiddenAt !== null,
      professionalProfileId: review.booking.professionalProfile.deletedAt ? null : review.booking.professionalProfile.id,
      businessName: review.booking.professionalProfile.businessName,
    }));
  }

  /**
   * Ultime recensioni pubbliche della piattaforma (sezione riprova sociale
   * in home). Demo esclusi
   * (come le statistiche pubbliche, StatsService). Nessun dato inventato:
   * se non ce ne sono, la home non mostra proprio la sezione.
   */
  async getRecentPublic(limit = 5) {
    const reviews = await this.prisma.review.findMany({
      where: {
        hiddenAt: null,
        booking: {
          professionalProfile: { isDemo: false, deletedAt: null, suspendedAt: null },
        },
      },
      include: {
        booking: {
          include: {
            professionalProfile: { include: { category: true } },
            client: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    return reviews.map((review) => ({
      id: review.id,
      rating: review.rating,
      comment: review.comment,
      createdAt: review.createdAt.toISOString(),
      // Nome di chi ha scritto la recensione (richiesta esplicita
      // dell'utente: "il nome da chi è stata fatta la recensione a mò di
      // firma in basso a destra") — stesso pattern `[name, surname].
      // filter(Boolean).join(" ")` già in uso ovunque nel progetto,
      // fallback "Cliente" sia per un nome mai compilato sia per un
      // account eliminato (name/surname già azzerati dal soft-delete,
      // CLAUDE.md §16 — nessuna logica di privacy aggiuntiva necessaria
      // qui, il fallback neutro copre già entrambi i casi).
      // Pagina pubblica: solo nome e iniziale del cognome (§216).
      clientName: publicClientName(review.booking.client) ?? "Cliente",
      professional: {
        // Richiesta esplicita dell'utente: le card devono essere cliccabili
        // verso la recensione in questione sul profilo pubblico — serve
        // l'id del professionista per costruire il link, mancava del tutto.
        id: review.booking.professionalProfile.id,
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
      include: {
        review: true,
        issue: { select: { status: true } },
        professionalProfile: { select: { userId: true } },
        quote: { select: { guidedRequestId: true } },
      },
    });
    if (!booking) {
      throw new NotFoundException("Prenotazione non trovata.");
    }
    if (booking.clientId !== clientId) {
      throw new ForbiddenException("Questa prenotazione non è tua.");
    }
    // Recensione solo da prenotazione confermata/completata (CLAUDE.md §8),
    // dopo la conferma del cliente ("servono i completed da entrambi"),
    // oppure dopo la decisione dell'admin su una segnalazione del cliente
    // (docs/CHANGELOG.md §164). Mai mentre la segnalazione è in esame.
    if (booking.review) {
      throw new ConflictException("Hai già recensito questa prenotazione.");
    }
    const allowed = clientCanReview({
      status: booking.status,
      clientConfirmedCompletedAt: booking.clientConfirmedCompletedAt,
      hasReview: false,
      issueStatus: booking.issue?.status ?? null,
    });
    if (!allowed) {
      if (booking.issue?.status === "OPEN" || booking.issue?.status === "CHAT") {
        throw new ForbiddenException("Potrai recensire quando la tua segnalazione sarà chiusa.");
      }
      if (!booking.clientConfirmedCompletedAt) throw new ForbiddenException("Conferma prima che il lavoro è terminato dal tuo lato.");
      throw new ForbiddenException("Puoi recensire solo un lavoro completato.");
    }

    const review = await this.prisma.review.create({
      data: { bookingId: input.bookingId, rating: input.rating, comment: input.comment, photoUrls: input.photoUrls },
    });

    // Metriche di affidabilità (CLAUDE.md §15, evento 5).
    await this.professionalMetricsService.recordReview(booking.professionalProfileId, input.rating);

    // Avviso al professionista (docs/CHANGELOG.md §185): la recensione è già
    // pubblica sul suo profilo.
    await this.notificationsService.notify(booking.professionalProfile.userId, "NEW_REVIEW", {
      bookingId: booking.id,
      guidedRequestId: booking.quote?.guidedRequestId ?? null,
      // Il cliente può recensire prima che il professionista segni il lavoro
      // come terminato (§189): l'email gli ricorda di farlo.
      professionalCompleted: booking.status === "COMPLETED",
    });

    return { id: review.id };
  }
}
