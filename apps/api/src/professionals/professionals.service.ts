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
      bio: profile.bio,
      subTags: profile.subTags,
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
        guidedRequest: { include: { category: true, quotes: { where: { professionalProfileId } } } },
      },
      orderBy: { createdAt: "desc" },
    });

    return leads.map((lead) => ({
      id: lead.id,
      status: lead.status,
      priceEurCents: lead.priceEurCents,
      createdAt: lead.createdAt.toISOString(),
      hasQuote: lead.guidedRequest.quotes.length > 0,
      guidedRequest: {
        id: lead.guidedRequest.id,
        categoryLabel: lead.guidedRequest.category.label,
        description: lead.guidedRequest.description,
        city: lead.guidedRequest.city,
        isUrgent: lead.guidedRequest.isUrgent,
      },
    }));
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
      include: { client: true, quote: { include: { items: true } } },
      orderBy: { scheduledAt: "asc" },
    });

    return bookings.map((booking) => ({
      id: booking.id,
      scheduledAt: booking.scheduledAt.toISOString(),
      status: booking.status,
      clientName: booking.client.name,
      items: (booking.quote?.items ?? []).map((item) => ({
        id: item.id,
        name: item.name,
        priceMinEurCents: item.priceMinEurCents,
        priceMaxEurCents: item.priceMaxEurCents,
      })),
    }));
  }

  async getMyAvailability(userId: string): Promise<MyAvailability> {
    const professionalProfileId = await this.requireMyProfileId(userId);
    const startOfToday = new Date();
    startOfToday.setUTCHours(0, 0, 0, 0);
    const endWindow = new Date(startOfToday);
    endWindow.setUTCDate(endWindow.getUTCDate() + 14);

    const [slots, profile, upcomingBookings, exceptions] = await Promise.all([
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
      this.prisma.availabilityException.findMany({
        where: { professionalProfileId, date: { gte: startOfToday } },
        orderBy: { date: "asc" },
        select: { date: true },
      }),
    ]);

    return {
      slots: slots.map((slot) => ({
        id: slot.id,
        dayOfWeek: slot.dayOfWeek,
        startTime: slot.startTime,
        endTime: slot.endTime,
        hasUpcomingBooking: upcomingBookings.some((booking) => {
          if (booking.scheduledAt.getUTCDay() !== slot.dayOfWeek) return false;
          const bookingTime = booking.scheduledAt.toISOString().slice(11, 16);
          return bookingTime >= slot.startTime && bookingTime < slot.endTime;
        }),
      })),
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

    const [slots, bookings, profile, exceptions] = await Promise.all([
      this.prisma.availabilitySlot.findMany({ where: { professionalProfileId } }),
      this.prisma.booking.findMany({
        where: {
          professionalProfileId,
          status: { in: ["PENDING", "CONFIRMED", "COMPLETED"] },
          scheduledAt: { gte: startOfToday, lt: endWindow },
        },
        select: { scheduledAt: true },
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
            .map((slot) => ({
              startTime: slot.startTime,
              endTime: slot.endTime,
              booked: isSlotBooked(bookings, dateStr, slot.startTime, slot.endTime),
            }));

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
