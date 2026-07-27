import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { PrismaClient } from "@professionisti/database";
import {
  findComuneByName,
  type MyProfessionalProfile,
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

  async search({ category, city, q, remote }: ProfessionalSearchParams): Promise<ProfessionalSearchResult[]> {
    const profiles = await this.prisma.professionalProfile.findMany({
      where: {
        ...(category ? { category: { slug: category } } : {}),
        ...(city ? { city: { equals: city, mode: "insensitive" } } : {}),
        ...(q ? { businessName: { contains: q, mode: "insensitive" } } : {}),
        ...(remote ? { remoteAvailable: true } : {}),
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

    const bookings = await this.prisma.booking.findMany({
      where: { professionalProfileId },
      include: { client: true, quote: true },
      orderBy: { scheduledAt: "desc" },
    });

    return bookings.map((booking) => ({
      id: booking.id,
      scheduledAt: booking.scheduledAt.toISOString(),
      status: booking.status,
      clientName: booking.client.name,
      laborEurCents: booking.quote?.laborEurCents ?? null,
      materialsEurCents: booking.quote?.materialsEurCents ?? null,
    }));
  }
}
