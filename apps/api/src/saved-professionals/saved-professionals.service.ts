import { Inject, Injectable } from "@nestjs/common";
import type { PrismaClient } from "@professionisti/database";
import type { ProfessionalSearchResult, ProfessionalCategorySlug } from "@professionisti/shared";
import { PRISMA } from "../prisma/prisma.module";

@Injectable()
export class SavedProfessionalsService {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  async save(userId: string, professionalProfileId: string) {
    await this.prisma.savedProfessional.upsert({
      where: { userId_professionalProfileId: { userId, professionalProfileId } },
      update: {},
      create: { userId, professionalProfileId },
    });
    return { saved: true };
  }

  async remove(userId: string, professionalProfileId: string) {
    await this.prisma.savedProfessional.deleteMany({ where: { userId, professionalProfileId } });
    return { saved: false };
  }

  async listForUser(userId: string): Promise<ProfessionalSearchResult[]> {
    const saved = await this.prisma.savedProfessional.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      include: {
        professionalProfile: {
          include: {
            category: true,
            bookings: { include: { review: true } },
            visibilityBoosts: { where: { status: "ACTIVE" } },
            services: true,
          },
        },
      },
    });

    return saved.map(({ professionalProfile: profile }) => {
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
        services: profile.services.map((service) => ({
          id: service.id,
          name: service.name,
          priceMinEurCents: service.priceMinEurCents,
          priceMaxEurCents: service.priceMaxEurCents,
        })),
        subTags: profile.subTags,
        spokenLanguages: profile.spokenLanguages,
        // La mini-agenda esiste solo nei risultati di ricerca (CLAUDE.md §12):
        // non vale la query batch aggiuntiva per una lista personale corta.
        availabilityPreview: [],
        nextAvailableSlotHome: null,
        nextAvailableSlotOnline: null,
        createdAt: profile.createdAt.toISOString(),
      } satisfies ProfessionalSearchResult;
    });
  }
}
