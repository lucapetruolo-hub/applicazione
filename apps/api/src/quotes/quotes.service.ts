import { ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { PrismaClient } from "@professionisti/database";
import type { QuoteSelfInput } from "@professionisti/shared";
import { PRISMA } from "../prisma/prisma.module";

@Injectable()
export class QuotesService {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  async createOrUpdate(userId: string, input: QuoteSelfInput) {
    const professionalProfile = await this.prisma.professionalProfile.findUnique({ where: { userId } });
    if (!professionalProfile) {
      throw new NotFoundException("Completa prima il tuo profilo professionista.");
    }

    // Il preventivo si può inviare solo se il professionista ha ricevuto il
    // lead per questa richiesta (fan-out in guided-requests) — evita che
    // chiunque possa rispondere a richieste non sue (CLAUDE.md §8).
    const lead = await this.prisma.lead.findUnique({
      where: {
        guidedRequestId_professionalProfileId: {
          guidedRequestId: input.requestId,
          professionalProfileId: professionalProfile.id,
        },
      },
    });
    if (!lead) {
      throw new ForbiddenException("Non hai ricevuto questa richiesta.");
    }

    const existingQuote = await this.prisma.quote.findFirst({
      where: { guidedRequestId: input.requestId, professionalProfileId: professionalProfile.id },
    });

    const data = {
      laborEurCents: input.laborEurCents,
      materialsEurCents: input.materialsEurCents,
      estimatedStartDate: new Date(input.estimatedStartDate),
      notes: input.notes,
    };

    const quote = existingQuote
      ? await this.prisma.quote.update({ where: { id: existingQuote.id }, data })
      : await this.prisma.quote.create({
          data: {
            ...data,
            guidedRequestId: input.requestId,
            professionalProfileId: professionalProfile.id,
          },
        });

    return { id: quote.id, status: quote.status };
  }
}
