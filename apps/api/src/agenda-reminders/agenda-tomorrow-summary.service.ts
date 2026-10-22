import { Inject, Injectable } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import type { PrismaClient } from "@professionisti/database";
import { formatAppointmentTimeRange, wallClockToday } from "@professionisti/shared";
import { PRISMA } from "../prisma/prisma.module";
import { NotificationsService } from "../notifications/notifications.service";

const DAY_MS = 24 * 60 * 60_000;

export type TomorrowSummaryItem = { time: string; name: string | null; place: string | null };

type SummaryBooking = {
  scheduledAt: Date;
  scheduledEndAt: Date | null;
  city: string | null;
  serviceMode: "HOME" | "ONLINE" | null;
  recipientName: string | null;
  recipientSurname: string | null;
  client: { name: string | null; surname: string | null };
};
type SummaryExternalJob = { scheduledAt: Date; scheduledEndAt: Date | null; clientName: string; address: string | null };

/**
 * Righe del riepilogo della sera prima (docs/CHANGELOG.md §288), in ordine di
 * orario: lavori della piattaforma e lavori esterni insieme. Nessun orario di
 * partenza: non sappiamo da dove parte il professionista (decisione dell'utente).
 */
export function tomorrowSummaryItems(bookings: SummaryBooking[], externalJobs: SummaryExternalJob[]): TomorrowSummaryItem[] {
  const rows = [
    ...bookings.map((b) => ({
      at: b.scheduledAt,
      item: {
        time: formatAppointmentTimeRange(b.scheduledAt, b.scheduledEndAt),
        name: [b.recipientName ?? b.client.name, b.recipientName ? b.recipientSurname : b.client.surname].filter(Boolean).join(" ") || null,
        place: b.serviceMode === "ONLINE" ? "online" : b.city,
      },
    })),
    ...externalJobs.map((j) => ({
      at: j.scheduledAt,
      item: { time: formatAppointmentTimeRange(j.scheduledAt, j.scheduledEndAt), name: j.clientName, place: j.address },
    })),
  ];
  return rows.sort((a, b) => a.at.getTime() - b.at.getTime()).map((row) => row.item);
}

/**
 * Riepilogo della sera prima (sito + email, argomento "Lavori e
 * appuntamenti", spegnibile): alle 19 a chi ha lavori confermati domani.
 */
@Injectable()
export class AgendaTomorrowSummaryService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly notificationsService: NotificationsService,
  ) {}

  @Cron("0 19 * * *", { timeZone: "Europe/Rome" })
  async sendTomorrowSummaries(now: Date = new Date()): Promise<void> {
    const tomorrow = new Date(wallClockToday(now).getTime() + DAY_MS);
    const dayAfter = new Date(tomorrow.getTime() + DAY_MS);
    const profiles = await this.prisma.professionalProfile.findMany({
      where: {
        isDemo: false,
        deletedAt: null,
        suspendedAt: null,
        user: { suspendedAt: null },
        OR: [
          { bookings: { some: { status: "CONFIRMED", scheduledAt: { gte: tomorrow, lt: dayAfter } } } },
          { externalJobs: { some: { status: "SCHEDULED", scheduledAt: { gte: tomorrow, lt: dayAfter } } } },
        ],
      },
      select: {
        userId: true,
        bookings: {
          where: { status: "CONFIRMED", scheduledAt: { gte: tomorrow, lt: dayAfter } },
          select: {
            scheduledAt: true,
            scheduledEndAt: true,
            city: true,
            serviceMode: true,
            recipientName: true,
            recipientSurname: true,
            client: { select: { name: true, surname: true } },
          },
        },
        externalJobs: {
          where: { status: "SCHEDULED", scheduledAt: { gte: tomorrow, lt: dayAfter } },
          select: { scheduledAt: true, scheduledEndAt: true, clientName: true, address: true },
        },
      },
    });
    const date = tomorrow.toISOString().slice(0, 10);
    for (const profile of profiles) {
      const items = tomorrowSummaryItems(profile.bookings, profile.externalJobs);
      if (items.length === 0) continue;
      // Un solo riepilogo per giorno, anche se il server si riavvia alle 19.
      const already = await this.prisma.notification.findFirst({
        where: { userId: profile.userId, type: "AGENDA_TOMORROW_SUMMARY", payload: { path: ["date"], equals: date } },
        select: { id: true },
      });
      if (already) continue;
      await this.notificationsService.notify(profile.userId, "AGENDA_TOMORROW_SUMMARY", { date, items });
    }
  }
}
