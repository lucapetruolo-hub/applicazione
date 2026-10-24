import { randomBytes } from "node:crypto";
import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { PrismaClient } from "@professionisti/database";
import { formatBookingAddress, type CalendarFeedStatus } from "@professionisti/shared";
import { PRISMA } from "../prisma/prisma.module";
import { calendarFeedIcs, type CalendarEvent } from "../email/email-calendar";
import { EMAIL_BRAND, frontendUrl } from "../email/email-brand";

const DAY_MS = 24 * 60 * 60_000;
/** Appuntamenti passati ancora nel calendario collegato. */
const PAST_DAYS = 60;

/**
 * Calendario collegato (docs/CHANGELOG.md §288): un link segreto che Google
 * Calendar e iPhone rileggono da soli, in sola lettura. Chi ha il link vede
 * gli appuntamenti: spegnerlo e riaccenderlo crea un link nuovo e rende
 * inutile quello vecchio.
 */
@Injectable()
export class CalendarFeedService {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  async status(userId: string): Promise<CalendarFeedStatus> {
    const profile = await this.prisma.professionalProfile.findUnique({ where: { userId }, select: { calendarFeedToken: true } });
    if (!profile) throw new NotFoundException("Profilo professionista non trovato.");
    return { token: profile.calendarFeedToken };
  }

  async enable(userId: string): Promise<CalendarFeedStatus> {
    const current = await this.status(userId);
    if (current.token) return current;
    const token = randomBytes(24).toString("base64url");
    await this.prisma.professionalProfile.update({ where: { userId }, data: { calendarFeedToken: token } });
    return { token };
  }

  async disable(userId: string): Promise<CalendarFeedStatus> {
    await this.status(userId);
    await this.prisma.professionalProfile.update({ where: { userId }, data: { calendarFeedToken: null } });
    return { token: null };
  }

  /** File .ics del link segreto, `null` se il link non esiste (più). */
  async ics(token: string, now: Date = new Date()): Promise<string | null> {
    if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
    const profile = await this.prisma.professionalProfile.findUnique({
      where: { calendarFeedToken: token },
      select: { id: true, deletedAt: true },
    });
    if (!profile || profile.deletedAt) return null;
    const since = new Date(now.getTime() - PAST_DAYS * DAY_MS);
    const [bookings, externalJobs] = await Promise.all([
      this.prisma.booking.findMany({
        where: { professionalProfileId: profile.id, OR: [{ scheduledAt: { gte: since } }, { scheduledEndAt: { gte: since } }], status: { in: ["PENDING", "CONFIRMED", "COMPLETED"] } },
        select: {
          id: true,
          scheduledAt: true,
          scheduledEndAt: true,
          serviceMode: true,
          street: true,
          houseNumber: true,
          addressExtra: true,
          postalCode: true,
          city: true,
          province: true,
          recipientName: true,
          recipientSurname: true,
          client: { select: { name: true, surname: true } },
          quote: { select: { guidedRequest: { select: { address: true, category: { select: { label: true } } } } } },
        },
        orderBy: { scheduledAt: "asc" },
      }),
      this.prisma.externalJob.findMany({
        where: { professionalProfileId: profile.id, OR: [{ scheduledAt: { gte: since } }, { scheduledEndAt: { gte: since } }], status: { in: ["SCHEDULED", "COMPLETED"] } },
        select: { id: true, scheduledAt: true, scheduledEndAt: true, clientName: true, address: true, description: true },
        orderBy: { scheduledAt: "asc" },
      }),
    ]);
    const agendaUrl = `${frontendUrl()}/dashboard/agenda`;
    const events: CalendarEvent[] = [
      ...bookings.map((b) => {
        const name = [b.recipientName ?? b.client.name, b.recipientName ? b.recipientSurname : b.client.surname].filter(Boolean).join(" ") || "Cliente";
        const category = b.quote?.guidedRequest?.category?.label;
        return {
          uid: `booking-${b.id}@agenda`,
          title: category ? `${category} · ${name}` : name,
          start: b.scheduledAt,
          end: b.scheduledEndAt,
          location: b.serviceMode === "ONLINE" ? "Online" : (formatBookingAddress(b) ?? b.quote?.guidedRequest?.address ?? null),
          description: `Dettagli nell'agenda: ${agendaUrl}`,
        };
      }),
      ...externalJobs.map((j) => ({
        uid: `external-${j.id}@agenda`,
        title: `${j.clientName} (lavoro esterno)`,
        start: j.scheduledAt,
        end: j.scheduledEndAt,
        location: j.address,
        description: j.description,
      })),
    ];
    return calendarFeedIcs(EMAIL_BRAND.name, events);
  }
}
