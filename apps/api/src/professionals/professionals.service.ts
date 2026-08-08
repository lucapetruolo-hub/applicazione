import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, type PrismaClient } from "@professionisti/database";
import {
  findComuneByName,
  type AvailabilitySlotInput,
  type BookAgendaSlotInput,
  type DeclineLeadInput,
  type MyAvailability,
  type MyProfessionalProfile,
  type ProfessionalAgenda,
  type ProfessionalAgendaDay,
  type ProfessionalAvailabilityPreviewDay,
  type ProfessionalNextAvailableSlot,
  type ProfessionalAvailableSlot,
  type ProfessionalBooking,
  type ProfessionalDetail,
  type ProfessionalLead,
  type ProfessionalSearchResult,
  type ProfessionalServiceItem,
  type ProfessionalCategorySlug,
  type ProfessionalProfileSelfInput,
  type UpdateEngagementRadiusInput,
} from "@professionisti/shared";
import { PRISMA } from "../prisma/prisma.module";
import { GeocodingService } from "../geocoding/geocoding.service";
import { slotAppliesOnDate } from "../common/availability.util";
import { NotificationsService } from "../notifications/notifications.service";
import { GuidedRequestsService } from "../guided-requests/guided-requests.service";
import { ProfessionalMetricsService } from "../professional-metrics/professional-metrics.service";
import { TimelineService } from "../timeline/timeline.service";

export type ProfessionalSearchParams = {
  category?: string;
  city?: string;
  q?: string;
  remote?: boolean;
  /** Esclude i profili demo del seed (isDemo) — usato dalla homepage per non mostrare vetrine finte come reali. */
  excludeDemo?: boolean;
};

// date.getUTCDay(): 0=domenica...6=sabato — stessa convenzione già usata in
// tutto il modulo agenda (vedi CLAUDE.md §11).
const WEEKDAY_SHORT_LABELS = ["Dom", "Lun", "Mar", "Mer", "Gio", "Ven", "Sab"];
const MONTH_SHORT_LABELS = ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"];

function formatDateLabel(date: Date): string {
  return `${date.getUTCDate()} ${MONTH_SHORT_LABELS[date.getUTCMonth()]}`;
}

// Colonne della griglia mostrata in card (Oggi + 3 giorni di default) —
// richiesta esplicita dell'utente, riferimento miodottore.it: "una
// visualizzazione agenda" con colonne giorno consecutive, non i soli giorni
// con qualcosa da mostrare (a differenza del comportamento precedente, che
// saltava i giorni vuoti: qui un giorno vuoto resta in griglia con "-" su
// ogni riga, esattamente come nel riferimento). Se la finestra iniziale non
// ha alcun orario libero si cerca il prossimo disponibile fino a
// PREVIEW_SEARCH_DAYS più avanti. PREVIEW_TOTAL_DAYS è quanti giorni vengono
// effettivamente restituiti al client (stesso orizzonte di getPublicAgenda,
// 14 giorni): la UI pagina in finestre da PREVIEW_MAX_DAYS colonne con
// frecce avanti/indietro sui dati già scaricati, senza una richiesta di rete
// per ogni pagina — richiesta esplicita dell'utente ("dare la possibilità
// di navigare anche ai giorni successivi").
const PREVIEW_MAX_DAYS = 4;
const PREVIEW_TOTAL_DAYS = 14;
const PREVIEW_SEARCH_DAYS = 30;

function mapServices(
  services: { id: string; name: string; priceMinEurCents: number | null; priceMaxEurCents: number | null }[],
): ProfessionalServiceItem[] {
  return services.map((service) => ({
    id: service.id,
    name: service.name,
    priceMinEurCents: service.priceMinEurCents,
    priceMaxEurCents: service.priceMaxEurCents,
  }));
}

@Injectable()
export class ProfessionalsService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly geocodingService: GeocodingService,
    private readonly notificationsService: NotificationsService,
    private readonly guidedRequestsService: GuidedRequestsService,
    private readonly professionalMetricsService: ProfessionalMetricsService,
    private readonly timelineService: TimelineService,
  ) {}

  async search({ category, city, q, remote, excludeDemo }: ProfessionalSearchParams): Promise<ProfessionalSearchResult[]> {
    const profiles = await this.prisma.professionalProfile.findMany({
      where: {
        // Un professionista che ha eliminato l'account non deve mai
        // ricomparire in ricerca (soft-delete, vedi AuthService.deleteAccount).
        deletedAt: null,
        ...(category ? { category: { slug: category } } : {}),
        ...(city ? { city: { equals: city, mode: "insensitive" } } : {}),
        ...(q ? { businessName: { contains: q, mode: "insensitive" } } : {}),
        ...(remote ? { remoteAvailable: true } : {}),
        ...(excludeDemo ? { isDemo: false } : {}),
      },
      include: {
        category: true,
        bookings: { include: { review: true } },
        visibilityBoosts: { where: { status: "ACTIVE" } },
        services: true,
      },
    });

    const previewsByProfileId = await this.buildAvailabilityPreviews(profiles.map((profile) => profile.id));

    const results = profiles.map((profile) => {
      const reviews = profile.bookings
        .map((booking) => booking.review)
        .filter((review): review is NonNullable<typeof review> => review !== null);
      const reviewCount = reviews.length;
      const rating =
        reviewCount > 0 ? Math.round((reviews.reduce((sum, review) => sum + review.rating, 0) / reviewCount) * 10) / 10 : null;
      const preview = previewsByProfileId.get(profile.id);

      return {
        id: profile.id,
        businessName: profile.businessName,
        categorySlug: profile.category.slug as ProfessionalCategorySlug,
        categoryLabel: profile.category.label,
        city: profile.city,
        address: profile.address,
        verified: profile.verified,
        rating,
        reviewCount,
        boosted: profile.visibilityBoosts.length > 0,
        remoteAvailable: profile.remoteAvailable,
        latitude: profile.latitude,
        longitude: profile.longitude,
        imageUrl: profile.imageUrl,
        services: mapServices(profile.services),
        subTags: profile.subTags,
        availabilityPreview: preview?.days ?? [],
        nextAvailableSlot: preview?.nextAvailableSlot ?? null,
        createdAt: profile.createdAt.toISOString(),
      } satisfies ProfessionalSearchResult;
    });

    // Ranking sponsorizzabile: boost attivo prima, poi rating, poi numero
    // recensioni (CLAUDE.md §1 — il ranking è la leva di monetizzazione).
    results.sort((a, b) => {
      if (a.boosted !== b.boosted) return a.boosted ? -1 : 1;
      const ratingDiff = (b.rating ?? 0) - (a.rating ?? 0);
      if (ratingDiff !== 0) return ratingDiff;
      return b.reviewCount - a.reviewCount;
    });

    return results;
  }

  /**
   * Anteprima "prossimi orari liberi" per la mini-agenda della card di
   * ricerca (richiesta esplicita dell'utente, riferimento miodottore.it).
   * Un'unica query batch per l'intera pagina di risultati invece di una per
   * professionista: a differenza di getPublicAgenda (14 giorni, un solo
   * profilo, chiamata dalla pagina profilo) qui il numero di profili può
   * essere alto e questa funzione gira dentro l'endpoint di ricerca, dove un
   * N+1 sarebbe un problema di scala reale, non solo teorico.
   */
  private async buildAvailabilityPreviews(
    profileIds: string[],
  ): Promise<Map<string, { days: ProfessionalAvailabilityPreviewDay[]; nextAvailableSlot: ProfessionalNextAvailableSlot | null }>> {
    const result = new Map<
      string,
      { days: ProfessionalAvailabilityPreviewDay[]; nextAvailableSlot: ProfessionalNextAvailableSlot | null }
    >();
    if (profileIds.length === 0) return result;

    const startOfToday = new Date();
    startOfToday.setUTCHours(0, 0, 0, 0);
    const searchEnd = new Date(startOfToday);
    searchEnd.setUTCDate(searchEnd.getUTCDate() + PREVIEW_SEARCH_DAYS);

    const [slots, bookings, exceptions] = await Promise.all([
      // Ogni fascia, a prescindere dalla capienza (richiesta esplicita
      // dell'utente: "devono comparire da subito gli orari disponibili a
      // prescindere se il professionista ha impostato la capienza per
      // quella fascia 1 o più di 1") — non più filtrate a maxBookings: 1
      // né gated dietro un opt-in del professionista.
      this.prisma.availabilitySlot.findMany({
        where: { professionalProfileId: { in: profileIds } },
      }),
      this.prisma.booking.findMany({
        where: {
          professionalProfileId: { in: profileIds },
          status: { in: ["PENDING", "CONFIRMED", "COMPLETED"] },
          scheduledAt: { gte: startOfToday, lt: searchEnd },
        },
        select: { professionalProfileId: true, scheduledAt: true },
      }),
      this.prisma.availabilityException.findMany({
        where: { professionalProfileId: { in: profileIds }, date: { gte: startOfToday, lt: searchEnd } },
        select: { professionalProfileId: true, date: true },
      }),
    ]);

    const slotsByProfile = new Map<string, typeof slots>();
    for (const slot of slots) {
      const list = slotsByProfile.get(slot.professionalProfileId) ?? [];
      list.push(slot);
      slotsByProfile.set(slot.professionalProfileId, list);
    }
    const bookingsByProfile = new Map<string, typeof bookings>();
    for (const booking of bookings) {
      const list = bookingsByProfile.get(booking.professionalProfileId) ?? [];
      list.push(booking);
      bookingsByProfile.set(booking.professionalProfileId, list);
    }
    const exceptionDatesByProfile = new Map<string, Set<string>>();
    for (const exception of exceptions) {
      const set = exceptionDatesByProfile.get(exception.professionalProfileId) ?? new Set<string>();
      set.add(exception.date.toISOString().slice(0, 10));
      exceptionDatesByProfile.set(exception.professionalProfileId, set);
    }

    for (const profileId of profileIds) {
      const profileSlots = slotsByProfile.get(profileId);
      if (!profileSlots || profileSlots.length === 0) continue;
      const profileBookings = bookingsByProfile.get(profileId) ?? [];
      const exceptionDates = exceptionDatesByProfile.get(profileId);

      // PREVIEW_TOTAL_DAYS colonne totali (14, stesso orizzonte di
      // getPublicAgenda) restituite al client, non solo le PREVIEW_MAX_DAYS
      // (4) mostrate di default: la UI pagina in avanti sui dati già
      // scaricati (richiesta esplicita dell'utente). Ogni giorno resta in
      // griglia con "-" dove il professionista non ha nulla, non viene
      // saltato — a differenza del comportamento pre-esistente che elencava
      // solo i primi giorni con qualcosa di libero. `hasAvailableInWindow`
      // guarda però solo alla finestra iniziale (i primi PREVIEW_MAX_DAYS):
      // decide se mostrare subito la griglia o il fallback "prossimo giorno
      // disponibile", il resto dei giorni serve solo alla navigazione.
      const days: ProfessionalAvailabilityPreviewDay[] = [];
      for (let offset = 0; offset < PREVIEW_TOTAL_DAYS; offset++) {
        const date = new Date(startOfToday);
        date.setUTCDate(date.getUTCDate() + offset);
        const dateStr = date.toISOString().slice(0, 10);
        const dayOfWeek = date.getUTCDay();
        const label = offset === 0 ? "Oggi" : offset === 1 ? "Domani" : WEEKDAY_SHORT_LABELS[dayOfWeek]!;
        const dateLabel = formatDateLabel(date);

        if (exceptionDates?.has(dateStr)) {
          days.push({ date: dateStr, label, dateLabel, times: [] });
          continue;
        }

        const times = profileSlots
          .filter((slot) => slotAppliesOnDate(slot, date))
          .sort((a, b) => a.startTime.localeCompare(b.startTime))
          .map((slot) => {
            // Una fascia resta prenotabile finché ha capienza residua, non
            // solo finché è del tutto libera — coerente con "una volta che
            // quella fascia consuma la capienza non deve essere più
            // prenotabile" (richiesta esplicita dell'utente).
            const available = countBookingsInSlot(profileBookings, dateStr, slot.startTime, slot.endTime) < slot.maxBookings;
            return { time: slot.startTime, endTime: slot.endTime, available };
          });
        days.push({ date: dateStr, label, dateLabel, times });
      }

      const hasAvailableInWindow = days.slice(0, PREVIEW_MAX_DAYS).some((day) => day.times.some((slot) => slot.available));

      let nextAvailableSlot: ProfessionalNextAvailableSlot | null = null;
      if (!hasAvailableInWindow) {
        for (let offset = PREVIEW_MAX_DAYS; offset < PREVIEW_SEARCH_DAYS && !nextAvailableSlot; offset++) {
          const date = new Date(startOfToday);
          date.setUTCDate(date.getUTCDate() + offset);
          const dateStr = date.toISOString().slice(0, 10);
          if (exceptionDates?.has(dateStr)) continue;

          const freeSlot = profileSlots
            .filter((slot) => slotAppliesOnDate(slot, date))
            .sort((a, b) => a.startTime.localeCompare(b.startTime))
            .find((slot) => countBookingsInSlot(profileBookings, dateStr, slot.startTime, slot.endTime) < slot.maxBookings);
          if (freeSlot) {
            nextAvailableSlot = { date: dateStr, dateLabel: formatDateLabel(date), time: freeSlot.startTime };
          }
        }
      }

      if (hasAvailableInWindow || nextAvailableSlot) {
        result.set(profileId, { days, nextAvailableSlot });
      }
    }

    return result;
  }

  async getById(id: string): Promise<ProfessionalDetail> {
    const profile = await this.prisma.professionalProfile.findUnique({
      where: { id },
      include: {
        category: true,
        bookings: { include: { review: true } },
        visibilityBoosts: { where: { status: "ACTIVE" } },
        services: true,
      },
    });

    if (!profile || profile.deletedAt) {
      throw new NotFoundException("Professionista non trovato.");
    }

    const reviews = profile.bookings
      .map((booking) => booking.review)
      .filter((review): review is NonNullable<typeof review> => review !== null)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    const reviewCount = reviews.length;
    const rating =
      reviewCount > 0 ? Math.round((reviews.reduce((sum, review) => sum + review.rating, 0) / reviewCount) * 10) / 10 : null;

    return {
      id: profile.id,
      businessName: profile.businessName,
      categorySlug: profile.category.slug as ProfessionalCategorySlug,
      categoryLabel: profile.category.label,
      city: profile.city,
      address: profile.address,
      verified: profile.verified,
      rating,
      reviewCount,
      boosted: profile.visibilityBoosts.length > 0,
      remoteAvailable: profile.remoteAvailable,
      latitude: profile.latitude,
      longitude: profile.longitude,
      imageUrl: profile.imageUrl,
      services: mapServices(profile.services),
      subTags: profile.subTags,
      // La pagina profilo mostra già l'agenda completa (getPublicAgenda):
      // l'anteprima compatta esiste solo per la card nei risultati di ricerca.
      availabilityPreview: [],
      nextAvailableSlot: null,
      createdAt: profile.createdAt.toISOString(),
      bio: profile.bio,
      portfolioUrls: profile.portfolioUrls,
      reviews: reviews.map((review) => ({
        id: review.id,
        rating: review.rating,
        comment: review.comment,
        photoUrls: review.photoUrls,
        createdAt: review.createdAt.toISOString(),
      })),
    };
  }

  async getMyProfile(userId: string): Promise<MyProfessionalProfile | null> {
    const profile = await this.prisma.professionalProfile.findUnique({
      where: { userId },
      include: { category: true, services: true },
    });
    if (!profile) return null;

    return {
      id: profile.id,
      businessName: profile.businessName,
      categorySlug: profile.category.slug,
      categoryLabel: profile.category.label,
      city: profile.city,
      address: profile.address,
      latitude: profile.latitude,
      longitude: profile.longitude,
      bio: profile.bio,
      subTags: profile.subTags,
      verified: profile.verified,
      remoteAvailable: profile.remoteAvailable,
      imageUrl: profile.imageUrl,
      portfolioUrls: profile.portfolioUrls,
      services: mapServices(profile.services),
      engagementRadiusKm: profile.engagementRadiusKm,
      urgentEngagementRadiusKm: profile.urgentEngagementRadiusKm,
    };
  }

  async upsertMyProfile(userId: string, input: ProfessionalProfileSelfInput): Promise<MyProfessionalProfile> {
    const category = await this.prisma.category.findUnique({ where: { slug: input.categorySlug } });
    if (!category) {
      throw new NotFoundException("Categoria non valida.");
    }

    // Posizione sulla mappa: se il professionista indica un indirizzo
    // preciso, prova a geocodificarlo (Nominatim) per posizionarlo esatto
    // invece che al centro del comune — richiesta esplicita dell'utente
    // ("scegliere sia la città generica, che un indirizzo preciso che andrà
    // a posizionarsi precisamente sulla mappa"). Se la geocodifica non trova
    // nulla (indirizzo incompleto, servizio non raggiungibile) si ricade sul
    // centro del comune scelto (dataset ISTAT, sempre disponibile), mai su
    // un blocco del salvataggio del profilo.
    const comune = findComuneByName(input.city);
    let latitude = input.latitude ?? comune?.lat ?? 0;
    let longitude = input.longitude ?? comune?.lon ?? 0;
    if (input.latitude === undefined && input.longitude === undefined && input.address?.trim()) {
      const geocoded = await this.geocodingService.geocodeAddress(`${input.address.trim()}, ${input.city}, Italia`);
      if (geocoded) {
        latitude = geocoded.latitude;
        longitude = geocoded.longitude;
      }
    }

    // Serve saperlo PRIMA dell'upsert (che non lo dice da sé): solo alla
    // primissima creazione del profilo va coinvolto nelle richieste guidate
    // già aperte in zona (vedi matchNewProfileToOpenRequests più sotto) —
    // un professionista che modifica il profilo esistente non deve
    // riceverne di nuove ogni volta che salva.
    const isFirstTimeCreation = (await this.prisma.professionalProfile.findUnique({ where: { userId }, select: { id: true } })) === null;

    const profile = await this.prisma.professionalProfile.upsert({
      where: { userId },
      update: {
        categoryId: category.id,
        subTags: input.subTags,
        businessName: input.businessName,
        city: input.city,
        address: input.address,
        latitude,
        longitude,
        bio: input.bio,
        remoteAvailable: input.remoteAvailable,
        // undefined = non inviata in questo salvataggio: Prisma la ignora e
        // lascia il valore esistente invariato, non la azzera.
        imageUrl: input.imageUrl,
        portfolioUrls: input.portfolioUrls,
      },
      create: {
        userId,
        categoryId: category.id,
        subTags: input.subTags,
        businessName: input.businessName,
        city: input.city,
        address: input.address,
        latitude,
        longitude,
        bio: input.bio,
        remoteAvailable: input.remoteAvailable,
        imageUrl: input.imageUrl,
        portfolioUrls: input.portfolioUrls,
      },
      include: { category: true },
    });

    // Lista prestazioni sostituita per intero ad ogni salvataggio (nessun
    // editing granulare per singola voce): coerente con la scala attesa
    // (poche voci a professionista), molto più semplice che diffare la
    // lista esistente contro quella inviata.
    await this.prisma.professionalService.deleteMany({ where: { professionalProfileId: profile.id } });
    if (input.services.length) {
      await this.prisma.professionalService.createMany({
        data: input.services.map((service) => ({
          professionalProfileId: profile.id,
          name: service.name,
          priceMinEurCents: service.priceMinEurCents ?? null,
          priceMaxEurCents: service.priceMaxEurCents ?? null,
        })),
      });
    }
    const savedServices = await this.prisma.professionalService.findMany({ where: { professionalProfileId: profile.id } });

    // Coinvolgimento nei confronti delle richieste guidate già aperte in
    // zona (CLAUDE.md §14, STEP 4) — solo alla primissima creazione del
    // profilo: non esiste in questo progetto un vero flusso di verifica
    // admin da usare come innesco (ProfessionalProfile.verified non è mai
    // impostato da nessuna parte), quindi il momento reale in cui un
    // professionista diventa eleggibile per ricerca/fan-out è proprio la
    // creazione del profilo, coerente con come funziona già oggi il resto
    // del sistema.
    if (isFirstTimeCreation) {
      await this.guidedRequestsService.matchNewProfileToOpenRequests({
        id: profile.id,
        userId,
        categoryId: profile.categoryId,
        latitude: profile.latitude,
        longitude: profile.longitude,
        engagementRadiusKm: profile.engagementRadiusKm,
        urgentEngagementRadiusKm: profile.urgentEngagementRadiusKm,
      });
    }

    return {
      id: profile.id,
      businessName: profile.businessName,
      categorySlug: profile.category.slug,
      categoryLabel: profile.category.label,
      city: profile.city,
      address: profile.address,
      latitude: profile.latitude,
      longitude: profile.longitude,
      bio: profile.bio,
      subTags: profile.subTags,
      verified: profile.verified,
      remoteAvailable: profile.remoteAvailable,
      imageUrl: profile.imageUrl,
      portfolioUrls: profile.portfolioUrls,
      services: mapServices(savedServices),
      engagementRadiusKm: profile.engagementRadiusKm,
      urgentEngagementRadiusKm: profile.urgentEngagementRadiusKm,
    };
  }

  async updateMyImage(userId: string, imageUrl: string): Promise<void> {
    // "Immagine profilo" è la prima sezione del form in /dashboard/profilo:
    // un professionista alla primissima configurazione può naturalmente
    // provare a caricare la foto prima ancora di aver compilato e salvato il
    // resto (nessuna riga ProfessionalProfile ancora). In quel caso non c'è
    // nulla su cui persistere subito l'URL — non è un errore da bloccare con
    // "Completa prima il tuo profilo professionista" (bug reale segnalato
    // dall'utente: appariva anche se stava letteralmente completando il
    // profilo in quel momento), semplicemente non c'è ancora un profilo:
    // l'URL resta nello stato del form e viene incluso nel primo salvataggio
    // vero e proprio (vedi `imageUrl` in professionalProfileSchema).
    const profile = await this.prisma.professionalProfile.findUnique({ where: { userId }, select: { id: true } });
    if (!profile) return;
    await this.prisma.professionalProfile.update({ where: { userId }, data: { imageUrl } });
  }

  /**
   * Aggiorna i due raggi di ingaggio (standard/urgente) del professionista
   * autenticato — editabili separatamente dal resto del profilo
   * (EngagementRadiusMap in /dashboard/profilo ha un proprio bottone
   * "Salva"). Il range 1-25 km è già validato da updateEngagementRadiusSchema
   * (ZodValidationPipe, stessa fonte di verità usata da ogni altro endpoint
   * di questo modulo) prima che l'input arrivi qui — nessuna doppia
   * validazione nel service.
   */
  async updateEngagementRadius(userId: string, input: UpdateEngagementRadiusInput): Promise<{ engagementRadiusKm: number; urgentEngagementRadiusKm: number }> {
    await this.requireMyProfileId(userId);
    const updated = await this.prisma.professionalProfile.update({
      where: { userId },
      data: {
        engagementRadiusKm: input.engagementRadiusKm,
        urgentEngagementRadiusKm: input.urgentEngagementRadiusKm,
      },
      select: { engagementRadiusKm: true, urgentEngagementRadiusKm: true },
    });
    return updated;
  }

  private async requireMyProfileId(userId: string): Promise<string> {
    const profile = await this.prisma.professionalProfile.findUnique({ where: { userId }, select: { id: true } });
    if (!profile) {
      throw new NotFoundException("Completa prima il tuo profilo professionista.");
    }
    return profile.id;
  }

  async getMyLeads(userId: string): Promise<ProfessionalLead[]> {
    const professionalProfileId = await this.requireMyProfileId(userId);

    const leads = await this.prisma.lead.findMany({
      where: { professionalProfileId },
      include: {
        guidedRequest: {
          include: { category: true, client: true, quotes: { where: { professionalProfileId }, include: { items: true } } },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return leads.map((lead) => {
      // quotes è filtrato per professionalProfileId nella query: al più una
      // voce (un professionista invia un solo preventivo per richiesta,
      // QuotesService.createOrUpdate aggiorna quello esistente invece di
      // crearne un secondo).
      const quote = lead.guidedRequest.quotes[0] ?? null;
      // Il più recente tra l'aggiornamento del lead stesso (es. rifiuto) e
      // quello del preventivo (invio/modifica) — "ultimo aggiornamento" per
      // l'ordinamento richiesto dall'utente deve riflettere qualunque delle
      // due cose sia successa più di recente.
      const updatedAt = quote && quote.updatedAt > lead.updatedAt ? quote.updatedAt : lead.updatedAt;
      return {
        id: lead.id,
        status: lead.status,
        declineNote: lead.declineNote,
        priceEurCents: lead.priceEurCents,
        createdAt: lead.createdAt.toISOString(),
        updatedAt: updatedAt.toISOString(),
        quote: quote
          ? {
              id: quote.id,
              status: quote.status,
              // Data+ora di invio (richiesta esplicita dell'utente,
              // visibile sia al cliente che al professionista): già
              // esistente sullo schema (Quote.createdAt), qui solo esposta.
              sentAt: quote.createdAt.toISOString(),
              estimatedStartDate: quote.estimatedStartDate.toISOString(),
              // Fine della fascia (richiesta esplicita dell'utente: mostrare
              // tutta la fascia oraria, non solo l'inizio) — null se non nota.
              estimatedEndDate: quote.estimatedEndDate?.toISOString() ?? null,
              clientProposedDate: quote.clientProposedDate?.toISOString() ?? null,
              clientProposedEndDate: quote.clientProposedEndDate?.toISOString() ?? null,
              clientProposedNote: quote.clientProposedNote,
              // Il preventivo già inviato, per mostrarlo al professionista
              // sulla propria dashboard invece del solo stato — richiesta
              // esplicita dell'utente ("dai la possibilità di vedere il
              // preventivo inviato... allo stesso professionista").
              items: quote.items.map((item) => ({
                id: item.id,
                name: item.name,
                priceMinEurCents: item.priceMinEurCents,
                priceMaxEurCents: item.priceMaxEurCents,
              })),
              notes: quote.notes,
            }
          : null,
        guidedRequest: {
          id: lead.guidedRequest.id,
          categoryLabel: lead.guidedRequest.category.label,
          description: lead.guidedRequest.description,
          city: lead.guidedRequest.city,
          // Nome e cognome del cliente (richiesta esplicita dell'utente,
          // "nelle richieste ricevute deve esserci anche il nome"): stesso
          // pattern già in uso in getMyBookings, join(" ") invece di solo
          // client.name per includere anche il cognome.
          clientName: [lead.guidedRequest.client.name, lead.guidedRequest.client.surname].filter(Boolean).join(" ") || null,
          // Telefono/email visibili già dalla prima richiesta ricevuta, non
          // solo dopo l'accettazione del preventivo — correzione esplicita
          // dell'utente rispetto alla scelta precedente (che li mostrava
          // solo su ProfessionalBooking/AcceptedJobCard): un professionista
          // deve poter contattare il cliente anche solo per chiarire i
          // dettagli prima di formulare un preventivo.
          clientPhone: lead.guidedRequest.client.phone,
          // Mai l'email anonimizzata sintetica (deleted-{id}@deleted.invalid,
          // scritta da AuthService.deleteAccount solo per liberare il
          // vincolo unico) — quella non è un vero indirizzo del cliente, e
          // mostrarla al professionista sarebbe fuorviante/rotta (link
          // "mailto:" verso un dominio inventato).
          clientEmail: lead.guidedRequest.client.deletedAt ? null : lead.guidedRequest.client.email,
          // Richiesta esplicita dell'utente: mostrare la foto profilo del
          // cliente (se presente) nella scheda aperta cliccando il nome
          // (ClientProfileModal) — stesso campo User.imageUrl già usato
          // per l'avatar dell'account cliente altrove nel sito.
          clientImageUrl: lead.guidedRequest.client.imageUrl,
          clientAccountDeleted: lead.guidedRequest.client.deletedAt !== null,
          address: lead.guidedRequest.address,
          photoUrls: lead.guidedRequest.photoUrls,
          isUrgent: lead.guidedRequest.isUrgent,
          // Valorizzati solo se la richiesta è nata da una fascia generica
          // dell'agenda (AvailabilitySlot.maxBookings > 1): il professionista
          // deve vedere subito per quale orario è stata richiesta.
          preferredDate: lead.guidedRequest.preferredDate?.toISOString().slice(0, 10) ?? null,
          preferredTimeSlot: lead.guidedRequest.preferredTimeSlot,
        },
      };
    });
  }

  /**
   * Il professionista rifiuta una richiesta ricevuta prima di inviare un
   * preventivo (richiesta esplicita dell'utente: un pop-up con nota
   * facoltativa per il cliente) — consentito solo se non ha già inviato un
   * preventivo per questa richiesta (a quel punto si ritira il preventivo,
   * non si rifiuta più il lead — vedi QuotesService.withdraw).
   */
  async declineLead(userId: string, leadId: string, input: DeclineLeadInput): Promise<void> {
    const professionalProfileId = await this.requireMyProfileId(userId);

    const lead = await this.prisma.lead.findUnique({
      where: { id: leadId },
      include: { guidedRequest: true },
    });
    if (!lead || lead.professionalProfileId !== professionalProfileId) {
      throw new ForbiddenException("Questa richiesta non è tua.");
    }
    if (lead.status === "DECLINED") {
      throw new ForbiddenException("Hai già rifiutato questa richiesta.");
    }
    const existingQuote = await this.prisma.quote.findFirst({
      where: { guidedRequestId: lead.guidedRequestId, professionalProfileId },
    });
    if (existingQuote) {
      throw new ForbiddenException("Hai già inviato un preventivo per questa richiesta: ritiralo invece di rifiutare il lead.");
    }

    await this.prisma.lead.update({
      where: { id: leadId },
      data: { status: "DECLINED", declineNote: input.note?.trim() || null },
    });

    await this.notificationsService.notify(lead.guidedRequest.clientId, "LEAD_DECLINED", {
      guidedRequestId: lead.guidedRequestId,
      professionalProfileId,
    });

    const declineNote = input.note?.trim() || null;
    await this.timelineService.log(
      lead.guidedRequestId,
      professionalProfileId,
      "PROFESSIONAL",
      `Il professionista ha rifiutato la richiesta.${declineNote ? ` Nota: "${declineNote}"` : ""}`,
    );

    // Espande subito verso il prossimo candidato in coda di riserva
    // (CLAUDE.md §14) — non serve aspettare il prossimo giro del job
    // schedulato quando si sa già ora che questo professionista non
    // risponderà: no-op se la coda è vuota.
    await this.guidedRequestsService.expandLeadQueue(lead.guidedRequestId);

    // Metriche di affidabilità (CLAUDE.md §15, evento 7): un rifiuto
    // esplicito è comunque un'azione del professionista, anche se non è la
    // "prima risposta" misurata dall'evento 2 (quella è solo l'invio di un
    // preventivo).
    await this.professionalMetricsService.touchActivity(professionalProfileId);
  }

  /**
   * Il professionista elimina dalla propria lista "Richieste ricevute" una
   * richiesta il cui account cliente è stato eliminato — richiesta esplicita
   * dell'utente: quella richiesta non è più azionabile (`QuotesService.
   * createOrUpdate` blocca già l'invio di un nuovo preventivo su un account
   * eliminato) e resterebbe altrimenti a ingombrare la lista per sempre.
   * Elimina solo il proprio Lead (non la GuidedRequest, che può avere altri
   * Lead verso altri professionisti nello stesso fan-out): nessun impatto
   * su Quote già inviate, che non hanno una relazione diretta con Lead nello
   * schema (CLAUDE.md §14).
   */
  async deleteLead(userId: string, leadId: string): Promise<void> {
    const professionalProfileId = await this.requireMyProfileId(userId);

    const lead = await this.prisma.lead.findUnique({
      where: { id: leadId },
      include: { guidedRequest: { include: { client: true } } },
    });
    if (!lead || lead.professionalProfileId !== professionalProfileId) {
      throw new ForbiddenException("Questa richiesta non è tua.");
    }
    if (lead.guidedRequest.client.deletedAt === null) {
      throw new ForbiddenException("Puoi eliminare una richiesta solo se l'account del cliente è stato eliminato.");
    }

    await this.prisma.lead.delete({ where: { id: leadId } });
  }

  async getMyBookings(userId: string): Promise<ProfessionalBooking[]> {
    const professionalProfileId = await this.requireMyProfileId(userId);

    // Ascendente (prossima prima): un'agenda operativa deve mostrare
    // l'appuntamento più vicino in cima, non il più lontano — bug reale,
    // l'ordinamento discendente precedente mostrava per primo l'impegno più
    // lontano nel futuro. La UI (/dashboard) raggruppa poi per giorno e
    // separa prossime/storico, questo endpoint resta la lista grezza.
    const bookings = await this.prisma.booking.findMany({
      where: { professionalProfileId },
      include: {
        client: true,
        // guidedRequest solo se la prenotazione viene da un preventivo
        // accettato (Booking.quoteId): porta l'indirizzo preciso indicato
        // dal cliente nella richiesta, più descrizione e foto del lavoro
        // (richiesta esplicita dell'utente, visibili al click su una
        // prenotazione in agenda). Le prenotazioni dirette da agenda
        // (bookAgendaSlot) non hanno una Quote/GuidedRequest collegata,
        // tutti questi campi restano null/[] in quel caso.
        quote: { include: { items: true, guidedRequest: { select: { address: true, description: true, photoUrls: true } } } },
        finalItems: true,
      },
      orderBy: { scheduledAt: "asc" },
    });

    return bookings.map((booking) => ({
      id: booking.id,
      // Richiesta guidata di origine, per il bottone "Vai alla cronologia
      // della richiesta" (richiesta esplicita dell'utente) — null per le
      // prenotazioni dirette da agenda pubblica (bookAgendaSlot), che non
      // hanno una Quote/GuidedRequest collegata.
      guidedRequestId: booking.quote?.guidedRequestId ?? null,
      scheduledAt: booking.scheduledAt.toISOString(),
      // Fine della fascia (richiesta esplicita dell'utente: mostrare tutta
      // la fascia oraria, non solo l'inizio) — null se non nota.
      scheduledEndAt: booking.scheduledEndAt?.toISOString() ?? null,
      createdAt: booking.createdAt.toISOString(),
      updatedAt: booking.updatedAt.toISOString(),
      status: booking.status,
      // Nome e cognome: prima esponeva solo booking.client.name (nome di
      // battesimo), non sufficiente per un professionista che deve
      // presentarsi al lavoro sapendo con chi ha a che fare — richiesta
      // esplicita dell'utente ("nome e cognome").
      clientName: [booking.client.name, booking.client.surname].filter(Boolean).join(" ") || null,
      clientPhone: booking.client.phone,
      // Mai l'email anonimizzata sintetica — stesso motivo di getMyLeads sopra.
      clientEmail: booking.client.deletedAt ? null : booking.client.email,
      clientAccountDeleted: booking.client.deletedAt !== null,
      address: booking.quote?.guidedRequest?.address ?? null,
      // Indirizzo di lavoro strutturato, raccolto nella schermata di
      // accettazione preventivo (richiesta esplicita dell'utente) — null
      // per le prenotazioni dirette da agenda pubblica (bookAgendaSlot,
      // che non passano da quella schermata) o per prenotazioni create
      // prima di questa funzionalità. Quando presente sostituisce, in UI,
      // il campo `address` libero sopra.
      recipientName: booking.recipientName,
      recipientSurname: booking.recipientSurname,
      recipientPhone: booking.recipientPhone,
      street: booking.street,
      houseNumber: booking.houseNumber,
      addressExtra: booking.addressExtra,
      postalCode: booking.postalCode,
      city: booking.city,
      province: booking.province,
      items: (booking.quote?.items ?? []).map((item) => ({
        id: item.id,
        name: item.name,
        priceMinEurCents: item.priceMinEurCents,
        priceMaxEurCents: item.priceMaxEurCents,
      })),
      finalAmountEurCents: booking.finalAmountEurCents,
      finalItems: booking.finalItems.map((item) => ({ id: item.id, name: item.name, priceEurCents: item.priceEurCents })),
      cancellationNote: booking.cancellationNote,
      // Chi ha annullato — richiesta esplicita dell'utente, mostrato accanto
      // all'etichetta "Annullata".
      canceledBy: booking.canceledBy,
      description: booking.quote?.guidedRequest?.description ?? null,
      photoUrls: booking.quote?.guidedRequest?.photoUrls ?? [],
      professionalNote: booking.professionalNote,
      // Il cliente ha segnalato che non ti sei presentato e ha chiesto un
      // rimborso — richiesta esplicita dell'utente, mai un cambio di
      // `status` automatico (il professionista può ancora contestarlo).
      refundRequested: booking.refundRequested,
      // Link della consulenza video (Meet/Zoom/ecc.), impostato dal
      // professionista stesso — richiesta esplicita dell'utente.
      meetingLink: booking.meetingLink,
    }));
  }

  /**
   * Fasce libere del professionista autenticato nei prossimi 14 giorni,
   * usate per far scegliere la data di un preventivo dentro l'agenda reale
   * invece di una data libera scollegata. Include sia le fasce esatte
   * (maxBookings=1) sia quelle a capienza (maxBookings>1) — bug reale
   * segnalato dall'utente ("negli invii dei preventivi non escono gli
   * orari disponibili già impostati nell'agenda personale"): il filtro
   * `maxBookings: 1` escludeva del tutto un professionista che avesse
   * impostato solo fasce a capienza (fasce che rappresentano comunque un
   * orario di lavoro reale, solo pensate per il fan-out di richieste
   * guidate — qui il professionista sta scegliendo quando iniziare un
   * lavoro già concordato, non sta consumando quella capienza). Ignora
   * bookableAgenda apposta (quel flag governa solo la prenotazione diretta
   * pubblica, qui il professionista guarda la propria agenda per
   * pianificare, non per farsi prenotare da un cliente).
   */
  async getMyAvailableSlots(userId: string): Promise<ProfessionalAvailableSlot[]> {
    const professionalProfileId = await this.requireMyProfileId(userId);
    const startOfToday = new Date();
    startOfToday.setUTCHours(0, 0, 0, 0);
    const endWindow = new Date(startOfToday);
    endWindow.setUTCDate(endWindow.getUTCDate() + 14);

    const [slots, bookings, exceptions] = await Promise.all([
      this.prisma.availabilitySlot.findMany({ where: { professionalProfileId } }),
      this.prisma.booking.findMany({
        where: {
          professionalProfileId,
          status: { in: ["PENDING", "CONFIRMED", "COMPLETED"] },
          scheduledAt: { gte: startOfToday, lt: endWindow },
        },
        select: { scheduledAt: true },
      }),
      this.prisma.availabilityException.findMany({
        where: { professionalProfileId, date: { gte: startOfToday, lt: endWindow } },
        select: { date: true },
      }),
    ]);
    const exceptionDates = new Set(exceptions.map((exception) => exception.date.toISOString().slice(0, 10)));

    const result: ProfessionalAvailableSlot[] = [];
    for (let i = 0; i < 14; i++) {
      const date = new Date(startOfToday);
      date.setUTCDate(date.getUTCDate() + i);
      const dateStr = date.toISOString().slice(0, 10);
      if (exceptionDates.has(dateStr)) continue;

      const freeSlots = slots
        .filter((slot) => slotAppliesOnDate(slot, date))
        .sort((a, b) => a.startTime.localeCompare(b.startTime))
        .filter((slot) => !isSlotBooked(bookings, dateStr, slot.startTime, slot.endTime));
      for (const slot of freeSlots) {
        result.push({ date: dateStr, startTime: slot.startTime, endTime: slot.endTime });
      }
    }
    return result;
  }

  async getMyAvailability(userId: string): Promise<MyAvailability> {
    const professionalProfileId = await this.requireMyProfileId(userId);
    const startOfToday = new Date();
    startOfToday.setUTCHours(0, 0, 0, 0);
    const endWindow = new Date(startOfToday);
    endWindow.setUTCDate(endWindow.getUTCDate() + 14);

    const [slots, upcomingBookings, exceptions] = await Promise.all([
      this.prisma.availabilitySlot.findMany({
        where: { professionalProfileId },
        orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
      }),
      // Stessa finestra di getPublicAgenda (14 giorni): serve solo a segnalare
      // in UI "questa fascia ha già una prenotazione futura", non a bloccare
      // nulla lato server — un professionista resta libero di modificare la
      // propria agenda, viene solo avvisato prima di farlo.
      this.prisma.booking.findMany({
        where: {
          professionalProfileId,
          status: { in: ["PENDING", "CONFIRMED", "COMPLETED"] },
          scheduledAt: { gte: startOfToday, lt: endWindow },
        },
        select: { scheduledAt: true },
      }),
      this.prisma.availabilityException.findMany({
        where: { professionalProfileId, date: { gte: startOfToday } },
        orderBy: { date: "asc" },
        select: { date: true },
      }),
    ]);

    return {
      slots: slots.map((slot) => {
        const slotDateStr = slot.date ? slot.date.toISOString().slice(0, 10) : null;
        // Per una fascia legata a una data esatta, l'avviso "hai già un
        // impegno futuro" ha senso solo per QUELLA data — a differenza delle
        // fasce ricorrenti (date=null, comportamento storico), dove qualunque
        // occorrenza del giorno della settimana nella finestra conta.
        //
        // Stesso criterio per fasce esatte e generiche (richiesta esplicita
        // dell'utente): conta solo una trattativa conclusa (Booking reale),
        // non una richiesta di preventivo ancora senza risposta — altrimenti
        // il professionista vedrebbe l'avviso "hai già un impegno" anche per
        // richieste che potrebbe rifiutare o lasciare cadere.
        const hasUpcomingBooking = upcomingBookings.some((booking) => {
          const bookingDateStr = booking.scheduledAt.toISOString().slice(0, 10);
          const dayMatches = slotDateStr ? bookingDateStr === slotDateStr : booking.scheduledAt.getUTCDay() === slot.dayOfWeek;
          if (!dayMatches) return false;
          const bookingTime = booking.scheduledAt.toISOString().slice(11, 16);
          return bookingTime >= slot.startTime && bookingTime < slot.endTime;
        });
        return {
          id: slot.id,
          dayOfWeek: slot.dayOfWeek,
          startTime: slot.startTime,
          endTime: slot.endTime,
          maxBookings: slot.maxBookings,
          date: slotDateStr,
          hasUpcomingBooking,
        };
      }),
      exceptionDates: exceptions.map((exception) => exception.date.toISOString().slice(0, 10)),
    };
  }

  async upsertMyAvailability(userId: string, slots: AvailabilitySlotInput[]): Promise<MyAvailability> {
    const professionalProfileId = await this.requireMyProfileId(userId);

    // Lista sostituita per intero ad ogni salvataggio, stesso pattern già
    // usato per le prestazioni (ProfessionalService): coerente con la scala
    // attesa (poche decine di fasce a professionista), molto più semplice
    // che diffare la lista esistente contro quella inviata. La validazione
    // di non-sovrapposizione tra fasce dello stesso giorno vive a monte, nello
    // zod schema condiviso (professionalAvailabilitySchema in packages/shared,
    // applicato da ZodValidationPipe) — stessa regola usata anche lato client.
    await this.prisma.availabilitySlot.deleteMany({ where: { professionalProfileId } });
    if (slots.length) {
      await this.prisma.availabilitySlot.createMany({
        data: slots.map((slot) => ({
          professionalProfileId,
          dayOfWeek: slot.dayOfWeek,
          startTime: slot.startTime,
          endTime: slot.endTime,
          maxBookings: slot.maxBookings,
          date: slot.date ? new Date(`${slot.date}T00:00:00.000Z`) : null,
        })),
      });
    }
    // Metriche di affidabilità (CLAUDE.md §15, evento 7): aggiornamento
    // disponibilità è un'azione esplicita del professionista.
    await this.professionalMetricsService.touchActivity(professionalProfileId);
    return this.getMyAvailability(userId);
  }

  /**
   * Giorno di chiusura straordinaria (ferie, festività, imprevisto): blocca
   * una data specifica senza toccare la ricorrenza settimanale. `upsert`
   * invece di `create` per restare idempotente (aggiungere due volte la
   * stessa data non deve fallire con un errore di vincolo unico visibile
   * all'utente).
   */
  async addAvailabilityException(userId: string, dateStr: string): Promise<{ exceptionDates: string[] }> {
    const professionalProfileId = await this.requireMyProfileId(userId);
    const date = parseIsoDateUtc(dateStr);
    await this.prisma.availabilityException.upsert({
      where: { professionalProfileId_date: { professionalProfileId, date } },
      create: { professionalProfileId, date },
      update: {},
    });
    return this.listMyExceptionDates(professionalProfileId);
  }

  async removeAvailabilityException(userId: string, dateStr: string): Promise<{ exceptionDates: string[] }> {
    const professionalProfileId = await this.requireMyProfileId(userId);
    const date = parseIsoDateUtc(dateStr);
    await this.prisma.availabilityException.deleteMany({ where: { professionalProfileId, date } });
    return this.listMyExceptionDates(professionalProfileId);
  }

  private async listMyExceptionDates(professionalProfileId: string): Promise<{ exceptionDates: string[] }> {
    const startOfToday = new Date();
    startOfToday.setUTCHours(0, 0, 0, 0);
    const exceptions = await this.prisma.availabilityException.findMany({
      where: { professionalProfileId, date: { gte: startOfToday } },
      orderBy: { date: "asc" },
      select: { date: true },
    });
    return { exceptionDates: exceptions.map((exception) => exception.date.toISOString().slice(0, 10)) };
  }

  /**
   * Agenda pubblica: proietta la disponibilità settimanale ricorrente sui
   * prossimi 14 giorni di calendario, barrando le fasce che coincidono con
   * una prenotazione reale già presa. Confronto su data/ora UTC (nessuna
   * libreria di timezone nello stack): coerente con come `scheduledAt` viene
   * già scritto/letto altrove nel progetto, senza introdurre una nuova
   * dipendenza per un confronto di sola data.
   */
  async getPublicAgenda(professionalProfileId: string): Promise<ProfessionalAgenda> {
    const startOfToday = new Date();
    startOfToday.setUTCHours(0, 0, 0, 0);
    const endWindow = new Date(startOfToday);
    endWindow.setUTCDate(endWindow.getUTCDate() + 14);

    const [slots, bookings, exceptions] = await Promise.all([
      this.prisma.availabilitySlot.findMany({ where: { professionalProfileId } }),
      this.prisma.booking.findMany({
        where: {
          professionalProfileId,
          status: { in: ["PENDING", "CONFIRMED", "COMPLETED"] },
          scheduledAt: { gte: startOfToday, lt: endWindow },
        },
        select: { scheduledAt: true },
      }),
      this.prisma.availabilityException.findMany({
        where: { professionalProfileId, date: { gte: startOfToday, lt: endWindow } },
        select: { date: true },
      }),
    ]);
    const exceptionDates = new Set(exceptions.map((exception) => exception.date.toISOString().slice(0, 10)));

    const days: ProfessionalAgendaDay[] = [];
    for (let i = 0; i < 14; i++) {
      const date = new Date(startOfToday);
      date.setUTCDate(date.getUTCDate() + i);
      const dayOfWeek = date.getUTCDay();
      const dateStr = date.toISOString().slice(0, 10);

      // Giorno di chiusura straordinaria: nessuna fascia, indipendentemente
      // dalla ricorrenza settimanale — stesso effetto visivo di un giorno
      // senza orari impostati (il frontend nasconde già i giorni senza slot).
      const daySlots = exceptionDates.has(dateStr)
        ? []
        : slots
            .filter((slot) => slotAppliesOnDate(slot, date))
            .sort((a, b) => a.startTime.localeCompare(b.startTime))
            .map((slot) => {
              // Sia per le fasce esatte che per quelle generiche, "prenotato"
              // conta solo una trattativa conclusa (Booking reale, creato
              // all'accettazione del preventivo) — non il semplice arrivo di
              // una richiesta di preventivo (richiesta esplicita dell'utente:
              // cliccare per richiedere non deve già "sbarrare" l'orario o
              // consumare la capienza mostrata al cliente). Una prenotazione
              // annullata non è nel set `bookings` (filtrato a monte su
              // PENDING/CONFIRMED/COMPLETED), quindi libera la fascia da sola.
              const bookedCount = countBookingsInSlot(bookings, dateStr, slot.startTime, slot.endTime);
              return { startTime: slot.startTime, endTime: slot.endTime, maxBookings: slot.maxBookings, bookedCount };
            });

      days.push({ date: dateStr, dayOfWeek, slots: daySlots });
    }
    return { days };
  }

  /**
   * Prenotazione diretta di una fascia esatta (maxBookings=1) dell'agenda
   * pubblica — richiesta esplicita dell'utente: rimosso il precedente
   * opt-in `bookableAgenda` ("permetti ai clienti di prenotare
   * direttamente"), la prenotazione diretta è ora sempre disponibile per
   * ogni fascia esatta, senza bisogno che il professionista lo attivi.
   * Le fasce a capienza (maxBookings>1) restano sul percorso "richiesta di
   * preventivo" (`GuidedRequestsService.resolveGenericSlot`), invariato.
   * Rivalida server-side che la fascia esista davvero nella disponibilità
   * ricorrente, non sia già occupata e non cada in un giorno di chiusura,
   * invece di fidarsi ciecamente di quanto inviato dal client.
   *
   * Il controllo "libera?" e la creazione della prenotazione avvengono dentro
   * un'unica transazione Serializable: senza, due clienti che toccano la
   * stessa fascia nello stesso istante possono entrambi superare il
   * controllo prima che l'altro scriva (race condition reale, non teorica,
   * in un marketplace dove "il primo che risponde si aggiudica il lavoro" -
   * CLAUDE.md §8). Postgres rifiuta una delle due transazioni con un errore
   * di serializzazione (P2034), che qui diventa un 409 pulito invece di
   * propagarsi come 500. Nessuna modifica allo schema per questo fix (niente
   * vincolo unique su Booking.scheduledAt): quel campo ha già un secondo
   * significato per le prenotazioni da preventivo (data stimata di inizio,
   * non uno slot esatto — due preventivi diversi possono legittimamente
   * condividere la stessa data), un vincolo globale li avrebbe rotti.
   */
  async bookAgendaSlot(clientId: string, professionalProfileId: string, input: BookAgendaSlotInput): Promise<{ bookingId: string }> {
    const profile = await this.prisma.professionalProfile.findUnique({
      where: { id: professionalProfileId },
      select: { id: true },
    });
    if (!profile) {
      throw new NotFoundException("Professionista non trovato.");
    }

    const date = parseIsoDateUtc(input.date);
    const dayOfWeek = date.getUTCDay();

    const [matchingSlot, exception] = await Promise.all([
      // Corrisponde sia a una fascia legata a questa data esatta sia a una
      // fascia ricorrente (date=null, comportamento storico) per lo stesso
      // giorno della settimana — vedi slotAppliesOnDate.
      this.prisma.availabilitySlot.findFirst({
        where: {
          professionalProfileId,
          startTime: input.startTime,
          endTime: input.endTime,
          OR: [{ date }, { date: null, dayOfWeek }],
        },
      }),
      this.prisma.availabilityException.findUnique({
        where: { professionalProfileId_date: { professionalProfileId, date } },
      }),
    ]);
    if (!matchingSlot) {
      throw new NotFoundException("Questa fascia oraria non fa parte dell'agenda del professionista.");
    }
    if (matchingSlot.maxBookings > 1) {
      throw new ForbiddenException("Questa fascia richiede l'invio di una richiesta di preventivo, non una prenotazione diretta.");
    }
    if (exception) {
      throw new ConflictException("Il professionista non è disponibile in questa data.");
    }

    const [hoursStr, minutesStr] = input.startTime.split(":");
    const scheduledAt = new Date(date);
    scheduledAt.setUTCHours(Number(hoursStr), Number(minutesStr), 0, 0);

    const dayStart = new Date(date);
    const dayEnd = new Date(date);
    dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

    try {
      const booking = await this.prisma.$transaction(
        async (tx) => {
          const existingBookings = await tx.booking.findMany({
            where: {
              professionalProfileId,
              status: { in: ["PENDING", "CONFIRMED", "COMPLETED"] },
              scheduledAt: { gte: dayStart, lt: dayEnd },
            },
            select: { scheduledAt: true },
          });
          if (isSlotBooked(existingBookings, input.date, input.startTime, input.endTime)) {
            throw new ConflictException("Questa fascia è già stata prenotata.");
          }
          return tx.booking.create({
            data: { clientId, professionalProfileId, scheduledAt, status: "PENDING" },
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
      return { bookingId: booking.id };
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2034") {
        throw new ConflictException("Questa fascia è già stata prenotata.");
      }
      throw err;
    }
  }
}

function parseIsoDateUtc(dateStr: string): Date {
  const date = new Date(`${dateStr}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    throw new BadRequestException("Data non valida.");
  }
  return date;
}

/**
 * Quante prenotazioni reali (Booking, non semplici richieste) cadono in
 * questa data+fascia — usata sia per le fasce esatte (capienza 1: il
 * booleano `isSlotBooked` sotto ne è un caso particolare) sia per quelle
 * generiche (capienza > 1, "N/M prenotazioni"). Richiesta esplicita
 * dell'utente: il conteggio deve riflettere solo le trattative concluse
 * (preventivo accettato → Booking creato), NON il semplice arrivo di una
 * richiesta di preventivo — cliccare per richiedere non deve "sbarrare"
 * l'orario, altrimenti la capienza si esaurirebbe con richieste mai
 * andate a buon fine. Una prenotazione annullata (CANCELED/NO_SHOW, già
 * esclusa dal filtro di stato a monte con cui `bookings` viene popolato)
 * libera automaticamente la fascia, senza bisogno di logica dedicata.
 */
function countBookingsInSlot(bookings: { scheduledAt: Date }[], dateStr: string, startTime: string, endTime: string): number {
  return bookings.filter((booking) => {
    const bookingDate = booking.scheduledAt.toISOString().slice(0, 10);
    if (bookingDate !== dateStr) return false;
    const bookingTime = booking.scheduledAt.toISOString().slice(11, 16);
    return bookingTime >= startTime && bookingTime < endTime;
  }).length;
}

function isSlotBooked(bookings: { scheduledAt: Date }[], dateStr: string, startTime: string, endTime: string): boolean {
  return countBookingsInSlot(bookings, dateStr, startTime, endTime) > 0;
}
