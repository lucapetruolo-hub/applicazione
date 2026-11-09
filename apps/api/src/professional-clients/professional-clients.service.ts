import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { PrismaClient } from "@professionisti/database";
import { externalClientKey, wallClockNow, type ProfessionalClient, type ProfessionalClientNoteInput } from "@professionisti/shared";
import { PRISMA } from "../prisma/prisma.module";
import { buildClientBook } from "./client-book";

/** Rubrica "I miei clienti" del professionista (docs/changelog/2026-11-08-rubrica-clienti.md). */
@Injectable()
export class ProfessionalClientsService {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  private async requireMyProfileId(userId: string): Promise<string> {
    const profile = await this.prisma.professionalProfile.findUnique({ where: { userId }, select: { id: true } });
    if (!profile) throw new NotFoundException("Completa prima il tuo profilo professionista.");
    return profile.id;
  }

  async listMine(userId: string): Promise<ProfessionalClient[]> {
    const professionalProfileId = await this.requireMyProfileId(userId);
    const [bookings, externalJobs, notes] = await Promise.all([
      this.prisma.booking.findMany({
        where: { professionalProfileId },
        select: {
          id: true,
          clientId: true,
          status: true,
          scheduledAt: true,
          finalAmountEurCents: true,
          recipientPhone: true,
          street: true,
          houseNumber: true,
          addressExtra: true,
          postalCode: true,
          city: true,
          province: true,
          client: { select: { name: true, surname: true, phone: true, email: true, deletedAt: true } },
          quote: { select: { guidedRequestId: true, items: { select: { name: true }, orderBy: { id: "asc" }, take: 1 }, guidedRequest: { select: { category: { select: { label: true } } } } } },
        },
      }),
      this.prisma.externalJob.findMany({
        where: { professionalProfileId },
        select: { id: true, clientName: true, clientPhone: true, address: true, description: true, scheduledAt: true, priceEurCents: true, status: true },
      }),
      this.prisma.professionalClientNote.findMany({ where: { professionalProfileId }, select: { clientKey: true, note: true } }),
    ]);
    return buildClientBook(bookings, externalJobs, new Map(notes.map((n) => [n.clientKey, n.note])), wallClockNow());
  }

  /** Nota privata su un cliente: vuota la cancella. Solo per clienti della propria rubrica. */
  async setNote(userId: string, input: ProfessionalClientNoteInput): Promise<{ note: string | null }> {
    const professionalProfileId = await this.requireMyProfileId(userId);
    if (!(await this.isMyClient(professionalProfileId, input.clientKey))) throw new BadRequestException("Questo cliente non è nella tua rubrica.");
    const note = input.note.trim();
    if (!note) {
      await this.prisma.professionalClientNote.deleteMany({ where: { professionalProfileId, clientKey: input.clientKey } });
      return { note: null };
    }
    await this.prisma.professionalClientNote.upsert({
      where: { professionalProfileId_clientKey: { professionalProfileId, clientKey: input.clientKey } },
      create: { professionalProfileId, clientKey: input.clientKey, note },
      update: { note },
    });
    return { note };
  }

  private async isMyClient(professionalProfileId: string, clientKey: string): Promise<boolean> {
    if (clientKey.startsWith("u:")) {
      const booking = await this.prisma.booking.findFirst({
        where: { professionalProfileId, clientId: clientKey.slice(2), status: { in: ["CONFIRMED", "COMPLETED"] }, client: { deletedAt: null } },
        select: { id: true },
      });
      return booking !== null;
    }
    const jobs = await this.prisma.externalJob.findMany({ where: { professionalProfileId }, select: { clientName: true, clientPhone: true } });
    return jobs.some((job) => externalClientKey(job.clientName, job.clientPhone) === clientKey);
  }
}
