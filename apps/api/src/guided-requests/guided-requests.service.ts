import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { PrismaClient } from "@professionisti/database";
import type { GuidedRequestInput, GuidedRequestUpdateInput } from "@professionisti/shared";
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

  /**
   * Modifica di una richiesta già inviata: solo descrizione e città (vedi
   * guidedRequestUpdateSchema), non la categoria — determina già a chi è
   * stata inoltrata la richiesta. Consentita finché non è CLOSED (una
   * richiesta chiusa ha già portato a una prenotazione, non ha senso
   * modificarla — stesso confine già usato per l'eliminazione).
   */
  async update(clientId: string, id: string, input: GuidedRequestUpdateInput) {
    const request = await this.requireOwnEditableRequest(clientId, id, "modificare");
    const updated = await this.prisma.guidedRequest.update({
      where: { id: request.id },
      data: { description: input.description, city: input.city },
    });
    return { id: updated.id, description: updated.description, city: updated.city };
  }

  /**
   * Eliminazione di una richiesta già inviata: cascata su Lead e Quote
   * (onDelete: Cascade nello schema Prisma). Bloccata se CLOSED — a quel
   * punto esiste una Booking che referenzia la Quote (Booking.quoteId non è
   * in cascade), cancellarla romperebbe un lavoro già confermato, oltre a
   * violare il vincolo di chiave esterna.
   */
  async remove(clientId: string, id: string): Promise<void> {
    await this.requireOwnEditableRequest(clientId, id, "eliminare");
    await this.prisma.guidedRequest.delete({ where: { id } });
  }

  private async requireOwnEditableRequest(clientId: string, id: string, action: string) {
    const request = await this.prisma.guidedRequest.findUnique({ where: { id } });
    if (!request) {
      throw new NotFoundException("Richiesta non trovata.");
    }
    if (request.clientId !== clientId) {
      throw new ForbiddenException("Questa richiesta non è tua.");
    }
    if (request.status === "CLOSED") {
      throw new ForbiddenException(`Non puoi ${action} una richiesta già conclusa.`);
    }
    return request;
  }
}
