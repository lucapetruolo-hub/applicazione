import { ConflictException, ForbiddenException, Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import type { PrismaClient } from "@professionisti/database";
import { clientCanReview, type ReviewInput } from "@professionisti/shared";
import { PRISMA } from "../prisma/prisma.module";
import { ProfessionalMetricsService } from "../professional-metrics/professional-metrics.service";
import { NotificationsService } from "../notifications/notifications.service";

// Recensioni "doppio cieco" (richiesta esplicita dell'utente): pubbliche
// solo quando entrambe le parti hanno recensito, a meno che non passino
// questi giorni di attesa — a quel punto la controparte mancante riceve una
// recensione automatica a 5 stelle (mostrata con l'etichetta "(recensione
// automatica)"), che sblocca comunque quella già scritta.
// Da docs/CHANGELOG.md §186 ognuno recensisce subito dopo il proprio
// "Lavoro terminato", anche prima dell'altro: l'attesa parte solo quando
// entrambi hanno segnato il lavoro come terminato (e dalla recensione, se
// arriva dopo), così la coppia non diventa mai pubblica prima.
export const AUTO_REVIEW_AFTER_DAYS = 3;

// Segnalazione decisa: il cliente può recensire anche un lavoro mai chiuso
// (clientCanReview), e l'attesa resta quella di sempre.
const DECIDED_ISSUE_STATUSES = ["UPHELD", "REJECTED", "RESOLVED", "UNRESOLVED"] as const;

/** Entrambi hanno cliccato "Lavoro terminato" da almeno `threshold`. */
function bothCompletedBefore(threshold: Date) {
  return {
    status: "COMPLETED" as const,
    clientConfirmedCompletedAt: { lt: threshold },
    // null solo per lavori chiusi dal vecchio cambio di stato del calendario.
    OR: [{ professionalCompletedAt: null }, { professionalCompletedAt: { lt: threshold } }],
  };
}

@Injectable()
export class ReviewsService {
  private readonly logger = new Logger(ReviewsService.name);

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly professionalMetricsService: ProfessionalMetricsService,
    private readonly notificationsService: NotificationsService,
  ) {}

  /**
   * Recensioni scritte dal cliente ai professionisti, per la scheda
   * "Inviate" di /le-mie-recensioni (docs/CHANGELOG.md §180). Tutte, anche
   * quelle non ancora pubbliche: sono sue. `isPublic` dice se il "doppio
   * cieco" le ha già sbloccate, `hidden` se un admin le ha nascoste.
   */
  async listMine(clientId: string) {
    const reviews = await this.prisma.review.findMany({
      where: { booking: { clientId } },
      include: {
        booking: {
          select: {
            clientReview: { select: { id: true } },
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
      isAutomatic: review.isAutomatic,
      isPublic: review.booking.clientReview !== null,
      hidden: review.hiddenAt !== null,
      professionalProfileId: review.booking.professionalProfile.deletedAt ? null : review.booking.professionalProfile.id,
      businessName: review.booking.professionalProfile.businessName,
    }));
  }

  /**
   * Ultime recensioni pubbliche della piattaforma (sezione riprova sociale
   * in home). Stesso filtro "doppio cieco" del profilo pubblico: visibili
   * solo se esiste anche la ClientReview sullo stesso booking. Demo esclusi
   * (come le statistiche pubbliche, StatsService). Nessun dato inventato:
   * se non ce ne sono, la home non mostra proprio la sezione.
   */
  async getRecentPublic(limit = 5) {
    const reviews = await this.prisma.review.findMany({
      where: {
        hiddenAt: null,
        booking: {
          clientReview: { isNot: null },
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
      // Le automatiche (5 stelle per controparte assente) non hanno testo
      // libero: l'etichetta "(recensione automatica)" la mette il frontend,
      // come già nella pagina profilo pubblica.
      comment: review.isAutomatic ? null : review.comment,
      isAutomatic: review.isAutomatic,
      createdAt: review.createdAt.toISOString(),
      // Nome di chi ha scritto la recensione (richiesta esplicita
      // dell'utente: "il nome da chi è stata fatta la recensione a mò di
      // firma in basso a destra") — stesso pattern `[name, surname].
      // filter(Boolean).join(" ")` già in uso ovunque nel progetto,
      // fallback "Cliente" sia per un nome mai compilato sia per un
      // account eliminato (name/surname già azzerati dal soft-delete,
      // CLAUDE.md §16 — nessuna logica di privacy aggiuntiva necessaria
      // qui, il fallback neutro copre già entrambi i casi).
      clientName: [review.booking.client.name, review.booking.client.surname].filter(Boolean).join(" ") || "Cliente",
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
        clientReview: { select: { id: true } },
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

    // Avviso al professionista (docs/CHANGELOG.md §185). Mai il voto: con il
    // "doppio cieco" lo vede solo quando ha recensito anche lui il cliente.
    await this.notificationsService.notify(booking.professionalProfile.userId, "NEW_REVIEW", {
      bookingId: booking.id,
      guidedRequestId: booking.quote?.guidedRequestId ?? null,
      published: booking.clientReview !== null,
      // Il cliente può recensire prima che il professionista segni il lavoro
      // come terminato (§186): l'email gli ricorda di farlo.
      professionalCompleted: booking.status === "COMPLETED",
    });

    return { id: review.id };
  }

  /**
   * Sblocco automatico "doppio cieco" (richiesta esplicita dell'utente):
   * se una recensione esiste da più di AUTO_REVIEW_AFTER_DAYS giorni senza
   * la controparte sull'altro lato, e da altrettanti giorni entrambi hanno
   * segnato il lavoro come terminato (§186), genera quella mancante a 5 stelle
   * (isAutomatic: true) — così entrambe risultano presenti e la coppia
   * diventa pubblica (vedi il filtro "entrambe esistono" in
   * ProfessionalsService.search/getById).
   */
  @Cron(CronExpression.EVERY_HOUR)
  async runAutoPublishCheck(): Promise<void> {
    const threshold = new Date(Date.now() - AUTO_REVIEW_AFTER_DAYS * 24 * 60 * 60 * 1000);

    const staleReviews = await this.prisma.review.findMany({
      where: {
        isAutomatic: false,
        createdAt: { lt: threshold },
        booking: {
          clientReview: { is: null },
          OR: [bothCompletedBefore(threshold), { issue: { status: { in: [...DECIDED_ISSUE_STATUSES] } } }],
        },
      },
      include: { booking: true },
    });
    for (const review of staleReviews) {
      await this.prisma.clientReview.create({
        data: { bookingId: review.bookingId, clientId: review.booking.clientId, rating: 5, isAutomatic: true, mediaUrls: [] },
      });
    }

    const staleClientReviews = await this.prisma.clientReview.findMany({
      // Mai una recensione automatica a 5 stelle al professionista se il
      // cliente ha segnalato un problema ancora aperto o accolto (§164-§165).
      where: {
        isAutomatic: false,
        createdAt: { lt: threshold },
        booking: {
          review: { is: null },
          AND: [bothCompletedBefore(threshold), { OR: [{ issue: { is: null } }, { issue: { status: { in: ["REJECTED", "RESOLVED"] } } }] }],
        },
      },
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
