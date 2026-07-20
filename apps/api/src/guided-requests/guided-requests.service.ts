import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { PrismaClient } from "@professionisti/database";
import type { GuidedRequestInput } from "@professionisti/shared";
import { PRISMA } from "../prisma/prisma.module";

// Lead standard vs urgente: la richiesta "ora" ha margine più alto per il
// professionista che risponde per primo (CLAUDE.md §7.5).
const LEAD_PRICE_STANDARD_EUR_CENTS = 500;
const LEAD_PRICE_URGENT_EUR_CENTS = 800;

@Injectable()
export class GuidedRequestsService {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  async create(clientId: string, input: GuidedRequestInput) {
    const category = await this.prisma.category.findUnique({ where: { slug: input.categorySlug } });
    if (!category) {
      throw new BadRequestException("Categoria non valida.");
    }

    if (input.professionalProfileId) {
      const targetProfile = await this.prisma.professionalProfile.findUnique({
        where: { id: input.professionalProfileId },
      });
      if (!targetProfile) {
        throw new NotFoundException("Professionista non trovato.");
      }
    }

    const guidedRequest = await this.prisma.guidedRequest.create({
      data: {
        clientId,
        categoryId: category.id,
        description: input.description,
        photoUrls: input.photoUrls,
        city: input.city,
        isUrgent: input.isUrgent,
      },
    });

    // Fan-out: se la richiesta parte dal profilo di un professionista specifico
    // va solo a lui, altrimenti a tutti i professionisti compatibili per
    // categoria+città (CLAUDE.md §8).
    const matchingProfiles = input.professionalProfileId
      ? await this.prisma.professionalProfile.findMany({ where: { id: input.professionalProfileId } })
      : await this.prisma.professionalProfile.findMany({
          where: { categoryId: category.id, city: { equals: input.city, mode: "insensitive" } },
        });

    const leadPriceEurCents = input.isUrgent ? LEAD_PRICE_URGENT_EUR_CENTS : LEAD_PRICE_STANDARD_EUR_CENTS;

    if (matchingProfiles.length > 0) {
      await this.prisma.lead.createMany({
        data: matchingProfiles.map((profile) => ({
          guidedRequestId: guidedRequest.id,
          professionalProfileId: profile.id,
          priceEurCents: leadPriceEurCents,
        })),
        skipDuplicates: true,
      });

      await this.prisma.guidedRequest.update({ where: { id: guidedRequest.id }, data: { status: "MATCHED" } });

      await this.prisma.notification.createMany({
        data: matchingProfiles.map((profile) => ({
          userId: profile.userId,
          channel: "PUSH" as const,
          type: "NEW_LEAD",
          payload: {
            guidedRequestId: guidedRequest.id,
            category: category.label,
            city: input.city,
            isUrgent: input.isUrgent,
          },
        })),
      });
    }

    return {
      guidedRequestId: guidedRequest.id,
      matchedProfessionals: matchingProfiles.length,
    };
  }

  /** Richieste (con relativi lead) inviate dal cliente autenticato. */
  async listForClient(clientId: string) {
    const requests = await this.prisma.guidedRequest.findMany({
      where: { clientId },
      include: {
        category: true,
        quotes: { include: { professionalProfile: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return requests.map((request) => ({
      id: request.id,
      categorySlug: request.category.slug,
      categoryLabel: request.category.label,
      description: request.description,
      city: request.city,
      isUrgent: request.isUrgent,
      status: request.status,
      createdAt: request.createdAt.toISOString(),
      quotes: request.quotes.map((quote) => ({
        id: quote.id,
        professionalProfileId: quote.professionalProfileId,
        businessName: quote.professionalProfile.businessName,
        laborEurCents: quote.laborEurCents,
        materialsEurCents: quote.materialsEurCents,
        estimatedStartDate: quote.estimatedStartDate.toISOString(),
        notes: quote.notes,
        status: quote.status,
      })),
    }));
  }
}
