import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { PrismaClient } from "@professionisti/database";
import {
  findComuneByName,
  type MyProfessionalProfile,
  type ProfessionalBooking,
  type ProfessionalDetail,
  type ProfessionalLead,
  type ProfessionalSearchResult,
  type ProfessionalCategorySlug,
  type ProfessionalProfileSelfInput,
} from "@professionisti/shared";
import { PRISMA } from "../prisma/prisma.module";

export type ProfessionalSearchParams = {
  category?: string;
  city?: string;
  q?: string;
  remote?: boolean;
};

@Injectable()
export class ProfessionalsService {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

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
        verified: profile.verified,
        rating,
        reviewCount,
        boosted: profile.visibilityBoosts.length > 0,
        remoteAvailable: profile.remoteAvailable,
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
      verified: profile.verified,
      rating,
      reviewCount,
      boosted: profile.visibilityBoosts.length > 0,
      remoteAvailable: profile.remoteAvailable,
      bio: profile.bio,
      subTags: profile.subTags,
      reviews: reviews.map((review) => ({
        id: review.id,
        rating: review.rating,
        comment: review.comment,
        createdAt: review.createdAt.toISOString(),
      })),
    };
  }

  async getMyProfile(userId: string): Promise<MyProfessionalProfile | null> {
    const profile = await this.prisma.professionalProfile.findUnique({
      where: { userId },
      include: { category: true },
    });
    if (!profile) return null;

    return {
      id: profile.id,
      businessName: profile.businessName,
      categorySlug: profile.category.slug,
      categoryLabel: profile.category.label,
      city: profile.city,
      bio: profile.bio,
      subTags: profile.subTags,
      verified: profile.verified,
      remoteAvailable: profile.remoteAvailable,
    };
  }

  async upsertMyProfile(userId: string, input: ProfessionalProfileSelfInput): Promise<MyProfessionalProfile> {
    const category = await this.prisma.category.findUnique({ where: { slug: input.categorySlug } });
    if (!category) {
      throw new NotFoundException("Categoria non valida.");
    }

    // Geocodifica reale dal comune scelto (dataset ISTAT in packages/shared)
    // quando lat/lng non sono fornite esplicitamente dal client.
    const comune = findComuneByName(input.city);
    const latitude = input.latitude ?? comune?.lat ?? 0;
    const longitude = input.longitude ?? comune?.lon ?? 0;

    const profile = await this.prisma.professionalProfile.upsert({
      where: { userId },
      update: {
        categoryId: category.id,
        subTags: input.subTags,
        businessName: input.businessName,
        city: input.city,
        latitude,
        longitude,
        bio: input.bio,
        remoteAvailable: input.remoteAvailable,
      },
      create: {
        userId,
        categoryId: category.id,
        subTags: input.subTags,
        businessName: input.businessName,
        city: input.city,
        latitude,
        longitude,
        bio: input.bio,
        remoteAvailable: input.remoteAvailable,
      },
      include: { category: true },
    });

    return {
      id: profile.id,
      businessName: profile.businessName,
      categorySlug: profile.category.slug,
      categoryLabel: profile.category.label,
      city: profile.city,
      bio: profile.bio,
      subTags: profile.subTags,
      verified: profile.verified,
      remoteAvailable: profile.remoteAvailable,
    };
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
