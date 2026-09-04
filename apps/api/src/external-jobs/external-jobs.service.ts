import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { PrismaClient } from "@professionisti/database";
import type { ExternalJobInput, ExternalJobUpdateInput } from "@professionisti/shared";
import { PRISMA } from "../prisma/prisma.module";

/**
 * Lavori presi al di fuori della piattaforma (richiesta esplicita
 * dell'utente): inseriti a mano dal professionista nella propria agenda,
 * nessun account cliente reale dietro — vedi il commento sul modello
 * `ExternalJob` in schema.prisma per il perché non è un `Booking` con
 * `clientId` opzionale.
 */
@Injectable()
export class ExternalJobsService {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  private async requireMyProfileId(userId: string): Promise<string> {
    const profile = await this.prisma.professionalProfile.findUnique({ where: { userId }, select: { id: true } });
    if (!profile) {
      throw new NotFoundException("Completa prima il tuo profilo professionista.");
    }
    return profile.id;
  }

  async create(userId: string, input: ExternalJobInput) {
    const professionalProfileId = await this.requireMyProfileId(userId);
    return this.prisma.externalJob.create({
      data: {
        professionalProfileId,
        clientName: input.clientName,
        clientPhone: input.clientPhone || null,
        address: input.address || null,
        description: input.description || null,
        scheduledAt: new Date(input.scheduledAt),
        scheduledEndAt: input.scheduledEndAt ? new Date(input.scheduledEndAt) : null,
        priceEurCents: input.priceEurCents ?? null,
        notes: input.notes || null,
      },
    });
  }

  async listMine(userId: string) {
    const professionalProfileId = await this.requireMyProfileId(userId);
    return this.prisma.externalJob.findMany({
      where: { professionalProfileId },
      orderBy: { scheduledAt: "asc" },
    });
  }

  /** Verifica titolarità prima di modificare/eliminare — mai fidarsi solo dell'id nell'URL. */
  private async requireOwnJob(userId: string, id: string) {
    const professionalProfileId = await this.requireMyProfileId(userId);
    const job = await this.prisma.externalJob.findUnique({ where: { id } });
    if (!job || job.professionalProfileId !== professionalProfileId) {
      throw new NotFoundException("Lavoro non trovato.");
    }
    return job;
  }

  async update(userId: string, id: string, input: ExternalJobUpdateInput) {
    await this.requireOwnJob(userId, id);
    return this.prisma.externalJob.update({
      where: { id },
      data: {
        ...(input.clientName !== undefined ? { clientName: input.clientName } : {}),
        ...(input.clientPhone !== undefined ? { clientPhone: input.clientPhone || null } : {}),
        ...(input.address !== undefined ? { address: input.address || null } : {}),
        ...(input.description !== undefined ? { description: input.description || null } : {}),
        ...(input.scheduledAt !== undefined ? { scheduledAt: new Date(input.scheduledAt) } : {}),
        ...(input.scheduledEndAt !== undefined ? { scheduledEndAt: input.scheduledEndAt ? new Date(input.scheduledEndAt) : null } : {}),
        ...(input.priceEurCents !== undefined ? { priceEurCents: input.priceEurCents } : {}),
        ...(input.notes !== undefined ? { notes: input.notes || null } : {}),
      },
    });
  }

  async updateStatus(userId: string, id: string, status: "SCHEDULED" | "COMPLETED" | "CANCELED") {
    await this.requireOwnJob(userId, id);
    return this.prisma.externalJob.update({ where: { id }, data: { status } });
  }

  async remove(userId: string, id: string) {
    await this.requireOwnJob(userId, id);
    await this.prisma.externalJob.delete({ where: { id } });
  }
}
