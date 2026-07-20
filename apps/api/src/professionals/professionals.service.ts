import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { PrismaClient } from "@professionisti/database";
import type { ProfessionalDetail, ProfessionalSearchResult, ProfessionalCategorySlug } from "@professionisti/shared";
import { PRISMA } from "../prisma/prisma.module";

export type ProfessionalSearchParams = {
  category?: string;
  city?: string;
  q?: string;
};

@Injectable()
export class ProfessionalsService {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  async search({ category, city, q }: ProfessionalSearchParams): Promise<ProfessionalSearchResult[]> {
    const profiles = await this.prisma.professionalProfile.findMany({
      where: {
        ...(category ? { category: { slug: category } } : {}),
        ...(city ? { city: { equals: city, mode: "insensitive" } } : {}),
        ...(q ? { businessName: { contains: q, mode: "insensitive" } } : {}),
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
}
