import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, type PrismaClient } from "@professionisti/database";
import {
  findComuneByName,
  type AvailabilitySlotInput,
  type BookAgendaSlotInput,
  type MyAvailability,
  type MyProfessionalProfile,
  type ProfessionalAgenda,
  type ProfessionalAgendaDay,
  type ProfessionalAvailabilityPreviewDay,
  type ProfessionalAvailableSlot,
  type ProfessionalBooking,
  type ProfessionalDetail,
  type ProfessionalLead,
  type ProfessionalSearchResult,
  type ProfessionalServiceItem,
  type ProfessionalCategorySlug,
  type ProfessionalProfileSelfInput,
} from "@professionisti/shared";
import { PRISMA } from "../prisma/prisma.module";
import { GeocodingService } from "../geocoding/geocoding.service";

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

const PREVIEW_WINDOW_DAYS = 9;
const PREVIEW_MAX_DAYS = 4;
const PREVIEW_MAX_TIMES_PER_DAY = 3;

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
  ) {}

  async search({ category, city, q, remote, excludeDemo }: ProfessionalSearchParams): Promise<ProfessionalSearchResult[]> {
    const profiles = await this.prisma.professionalProfile.findMany({
      where: {
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
        availabilityPreview: previewsByProfileId.get(profile.id) ?? [],
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
  private async buildAvailabilityPreviews(profileIds: string[]): Promise<Map<string, ProfessionalAvailabilityPreviewDay[]>> {
    const result = new Map<string, ProfessionalAvailabilityPreviewDay[]>();
    if (profileIds.length === 0) return result;

    const startOfToday = new Date();
    startOfToday.setUTCHours(0, 0, 0, 0);
    const endWindow = new Date(startOfToday);
    endWindow.setUTCDate(endWindow.getUTCDate() + PREVIEW_WINDOW_DAYS);

    const [profiles, slots, bookings, exceptions] = await Promise.all([
      this.prisma.professionalProfile.findMany({
        where: { id: { in: profileIds }, bookableAgenda: true },
        select: { id: true },
      }),
      // Solo fasce esatte (maxBookings=1): le fasce generiche richiedono
      // comunque un preventivo, non sono "prenotabili" con un click sulla
      // pillola della mini-agenda.
      this.prisma.availabilitySlot.findMany({
        where: { professionalProfileId: { in: profileIds }, maxBookings: 1 },
      }),
      this.prisma.booking.findMany({
        where: {
          professionalProfileId: { in: profileIds },
          status: { in: ["PENDING", "CONFIRMED", "COMPLETED"] },
          scheduledAt: { gte: startOfToday, lt: endWindow },
        },
        select: { professionalProfileId: true, scheduledAt: true },
      }),
      this.prisma.availabilityException.findMany({
        where: { professionalProfileId: { in: profileIds }, date: { gte: startOfToday, lt: endWindow } },
        select: { professionalProfileId: true, date: true },
      }),
    ]);

    const bookableProfileIds = new Set(profiles.map((profile) => profile.id));
    if (bookableProfileIds.size === 0) return result;

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

    for (const profileId of bookableProfileIds) {
      const profileSlots = slotsByProfile.get(profileId);
      if (!profileSlots || profileSlots.length === 0) continue;
      const profileBookings = bookingsByProfile.get(profileId) ?? [];
      const exceptionDates = exceptionDatesByProfile.get(profileId);

      const days: ProfessionalAvailabilityPreviewDay[] = [];
      for (let offset = 0; offset < PREVIEW_WINDOW_DAYS && days.length < PREVIEW_MAX_DAYS; offset++) {
        const date = new Date(startOfToday);
        date.setUTCDate(date.getUTCDate() + offset);
        const dateStr = date.toISOString().slice(0, 10);
        if (exceptionDates?.has(dateStr)) continue;

        const dayOfWeek = date.getUTCDay();
        const times = profileSlots
          .filter((slot) => slot.dayOfWeek === dayOfWeek)
          .sort((a, b) => a.startTime.localeCompare(b.startTime))
          .filter((slot) => !isSlotBooked(profileBookings, dateStr, slot.startTime, slot.endTime))
          .slice(0, PREVIEW_MAX_TIMES_PER_DAY)
          .map((slot) => slot.startTime);
        if (times.length === 0) continue;

        const label = offset === 0 ? "Oggi" : offset === 1 ? "Domani" : WEEKDAY_SHORT_LABELS[dayOfWeek]!;
        days.push({ date: dateStr, label, times });
      }

      if (days.length > 0) result.set(profileId, days);
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

    if (!profile) {
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
      bio: profile.bio,
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
      bio: profile.bio,
      subTags: profile.subTags,
      verified: profile.verified,
      remoteAvailable: profile.remoteAvailable,
      imageUrl: profile.imageUrl,
      services: mapServices(profile.services),
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

    return {
      id: profile.id,
      businessName: profile.businessName,
      categorySlug: profile.category.slug,
      categoryLabel: profile.category.label,
      city: profile.city,
      address: profile.address,
      bio: profile.bio,
      subTags: profile.subTags,
      verified: profile.verified,
      remoteAvailable: profile.remoteAvailable,
      imageUrl: profile.imageUrl,
      services: mapServices(savedServices),
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
        guidedRequest: { include: { category: true, client: true, quotes: { where: { professionalProfileId } } } },
      },
      orderBy: { createdAt: "desc" },
    });

    return leads.map((lead) => {
      // quotes è filtrato per professionalProfileId nella query: al più una
      // voce (un professionista invia un solo preventivo per richiesta,
      // QuotesService.createOrUpdate aggiorna quello esistente invece di
      // crearne un secondo).
      const quote = lead.guidedRequest.quotes[0] ?? null;
      return {
        id: lead.id,
        status: lead.status,
        priceEurCents: lead.priceEurCents,
        createdAt: lead.createdAt.toISOString(),
        quote: quote
          ? {
              id: quote.id,
              status: quote.status,
              estimatedStartDate: quote.estimatedStartDate.toISOString(),
              clientProposedDate: quote.clientProposedDate?.toISOString() ?? null,
              clientProposedNote: quote.clientProposedNote,
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
          clientEmail: lead.guidedRequest.client.email,
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
        // dal cliente nella richiesta. Le prenotazioni dirette da agenda
        // (bookAgendaSlot) non hanno una Quote/GuidedRequest collegata,
        // address resta null in quel caso.
        quote: { include: { items: true, guidedRequest: { select: { address: true } } } },
      },
      orderBy: { scheduledAt: "asc" },
    });

    return bookings.map((booking) => ({
      id: booking.id,
      scheduledAt: booking.scheduledAt.toISOString(),
      status: booking.status,
      // Nome e cognome: prima esponeva solo booking.client.name (nome di
      // battesimo), non sufficiente per un professionista che deve
      // presentarsi al lavoro sapendo con chi ha a che fare — richiesta
      // esplicita dell'utente ("nome e cognome").
      clientName: [booking.client.name, booking.client.surname].filter(Boolean).join(" ") || null,
      clientPhone: booking.client.phone,
      clientEmail: booking.client.email,
      address: booking.quote?.guidedRequest?.address ?? null,
      items: (booking.quote?.items ?? []).map((item) => ({
        id: item.id,
        name: item.name,
        priceMinEurCents: item.priceMinEurCents,
        priceMaxEurCents: item.priceMaxEurCents,
      })),
    }));
  }

  /**
   * Fasce esatte libere del professionista autenticato nei prossimi 14
   * giorni (solo maxBookings=1, le fasce a capienza non c'entrano con una
   * "data di inizio" puntuale): usata per far scegliere la data di un
   * preventivo dentro l'agenda reale invece di una data libera scollegata.
   * Ignora bookableAgenda apposta (quel flag governa solo la prenotazione
   * diretta pubblica, qui il professionista guarda la propria agenda per
   * pianificare, non per farsi prenotare da un cliente).
   */
  async getMyAvailableSlots(userId: string): Promise<ProfessionalAvailableSlot[]> {
    const professionalProfileId = await this.requireMyProfileId(userId);
    const startOfToday = new Date();
    startOfToday.setUTCHours(0, 0, 0, 0);
    const endWindow = new Date(startOfToday);
    endWindow.setUTCDate(endWindow.getUTCDate() + 14);

    const [slots, bookings, exceptions] = await Promise.all([
      this.prisma.availabilitySlot.findMany({ where: { professionalProfileId, maxBookings: 1 } }),
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

      const dayOfWeek = date.getUTCDay();
      const freeSlots = slots
        .filter((slot) => slot.dayOfWeek === dayOfWeek)
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

    const [slots, profile, upcomingBookings, upcomingGenericRequests, exceptions] = await Promise.all([
      this.prisma.availabilitySlot.findMany({
        where: { professionalProfileId },
        orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
      }),
      this.prisma.professionalProfile.findUniqueOrThrow({ where: { id: professionalProfileId }, select: { bookableAgenda: true } }),
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
      // Equivalente per le fasce generiche (maxBookings > 1): non nascono
      // Booking ma GuidedRequest con preferredDate/preferredTimeSlot.
      this.prisma.guidedRequest.findMany({
        where: { professionalProfileId, preferredDate: { gte: startOfToday, lt: endWindow } },
        select: { preferredDate: true, preferredTimeSlot: true },
      }),
      this.prisma.availabilityException.findMany({
        where: { professionalProfileId, date: { gte: startOfToday } },
        orderBy: { date: "asc" },
        select: { date: true },
      }),
    ]);

    return {
      slots: slots.map((slot) => {
        const timeRange = `${slot.startTime}-${slot.endTime}`;
        const hasUpcomingBooking =
          slot.maxBookings > 1
            ? upcomingGenericRequests.some(
                (request) => request.preferredDate?.getUTCDay() === slot.dayOfWeek && request.preferredTimeSlot === timeRange,
              )
            : upcomingBookings.some((booking) => {
                if (booking.scheduledAt.getUTCDay() !== slot.dayOfWeek) return false;
                const bookingTime = booking.scheduledAt.toISOString().slice(11, 16);
                return bookingTime >= slot.startTime && bookingTime < slot.endTime;
              });
        return {
          id: slot.id,
          dayOfWeek: slot.dayOfWeek,
          startTime: slot.startTime,
          endTime: slot.endTime,
          maxBookings: slot.maxBookings,
          hasUpcomingBooking,
        };
      }),
      bookableAgenda: profile.bookableAgenda,
      exceptionDates: exceptions.map((exception) => exception.date.toISOString().slice(0, 10)),
    };
  }

  async upsertMyAvailability(userId: string, slots: AvailabilitySlotInput[], bookableAgenda: boolean): Promise<MyAvailability> {
    const professionalProfileId = await this.requireMyProfileId(userId);

    // Lista sostituita per intero ad ogni salvataggio, stesso pattern già
    // usato per le prestazioni (ProfessionalService): coerente con la scala
    // attesa (poche decine di fasce a professionista), molto più semplice
    // che diffare la lista esistente contro quella inviata. La validazione
    // di non-sovrapposizione tra fasce dello stesso giorno vive a monte, nello
    // zod schema condiviso (professionalAvailabilitySchema in packages/shared,
    // applicato da ZodValidationPipe) — stessa regola usata anche lato client.
    await Promise.all([
      this.prisma.availabilitySlot.deleteMany({ where: { professionalProfileId } }),
      this.prisma.professionalProfile.update({ where: { id: professionalProfileId }, data: { bookableAgenda } }),
    ]);
    if (slots.length) {
      await this.prisma.availabilitySlot.createMany({
        data: slots.map((slot) => ({
          professionalProfileId,
          dayOfWeek: slot.dayOfWeek,
          startTime: slot.startTime,
          endTime: slot.endTime,
          maxBookings: slot.maxBookings,
        })),
      });
    }
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

    const [slots, bookings, genericRequests, profile, exceptions] = await Promise.all([
      this.prisma.availabilitySlot.findMany({ where: { professionalProfileId } }),
      this.prisma.booking.findMany({
        where: {
          professionalProfileId,
          status: { in: ["PENDING", "CONFIRMED", "COMPLETED"] },
          scheduledAt: { gte: startOfToday, lt: endWindow },
        },
        select: { scheduledAt: true },
      }),
      // Per le fasce generiche (maxBookings > 1) la "prenotazione" è una
      // richiesta di preventivo con preferredDate/preferredTimeSlot, non un
      // Booking — contata a parte, per data esatta (non per giorno della
      // settimana come in getMyAvailability: qui serve sapere la capienza
      // residua di QUEL giorno preciso, non solo se la ricorrenza è "usata").
      this.prisma.guidedRequest.findMany({
        where: { professionalProfileId, preferredDate: { gte: startOfToday, lt: endWindow } },
        select: { preferredDate: true, preferredTimeSlot: true },
      }),
      this.prisma.professionalProfile.findUniqueOrThrow({ where: { id: professionalProfileId }, select: { bookableAgenda: true } }),
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
            .filter((slot) => slot.dayOfWeek === dayOfWeek)
            .sort((a, b) => a.startTime.localeCompare(b.startTime))
            .map((slot) => {
              const bookedCount =
                slot.maxBookings > 1
                  ? genericRequests.filter(
                      (request) =>
                        request.preferredDate?.toISOString().slice(0, 10) === dateStr &&
                        request.preferredTimeSlot === `${slot.startTime}-${slot.endTime}`,
                    ).length
                  : isSlotBooked(bookings, dateStr, slot.startTime, slot.endTime)
                    ? 1
                    : 0;
              return { startTime: slot.startTime, endTime: slot.endTime, maxBookings: slot.maxBookings, bookedCount };
            });

      days.push({ date: dateStr, dayOfWeek, slots: daySlots });
    }
    return { bookableAgenda: profile.bookableAgenda, days };
  }

  /**
   * Prenotazione diretta di una fascia dell'agenda pubblica: solo se il
   * professionista ha attivato `bookableAgenda` (checkbox in
   * /dashboard/agenda, "dà l'opzione al cliente di potersi prenotare",
   * altrimenti l'agenda resta solo informativa). Rivalida server-side che la
   * fascia esista davvero nella disponibilità ricorrente, non sia già
   * occupata e non cada in un giorno di chiusura, invece di fidarsi
   * ciecamente di quanto inviato dal client.
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
      select: { bookableAgenda: true },
    });
    if (!profile) {
      throw new NotFoundException("Professionista non trovato.");
    }
    if (!profile.bookableAgenda) {
      throw new ForbiddenException("Questo professionista non permette la prenotazione diretta dall'agenda.");
    }

    const date = parseIsoDateUtc(input.date);
    const dayOfWeek = date.getUTCDay();

    const [matchingSlot, exception] = await Promise.all([
      this.prisma.availabilitySlot.findFirst({
        where: { professionalProfileId, dayOfWeek, startTime: input.startTime, endTime: input.endTime },
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

function isSlotBooked(bookings: { scheduledAt: Date }[], dateStr: string, startTime: string, endTime: string): boolean {
  return bookings.some((booking) => {
    const bookingDate = booking.scheduledAt.toISOString().slice(0, 10);
    if (bookingDate !== dateStr) return false;
    const bookingTime = booking.scheduledAt.toISOString().slice(11, 16);
    return bookingTime >= startTime && bookingTime < endTime;
  });
}
