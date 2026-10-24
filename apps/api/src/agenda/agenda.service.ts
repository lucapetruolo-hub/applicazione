import { Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import type { Prisma, PrismaClient } from "@professionisti/database";
import {
  agendaWeekTemplateSchema,
  dayPartOf,
  ITALIAN_COMUNI,
  DEFAULT_WEEK_TEMPLATE,
  PUBLIC_AGENDA_DAYS,
  wallClockToday,
  weekTemplateSync,
  ZONE_DEMAND_MIN_REQUESTS,
  type AgendaWeekTemplate,
  type AgendaWeekTemplateState,
  type DayPart,
  type WeatherDayAlert,
  type ZoneDemand,
  type ZoneDemandTip,
} from "@professionisti/shared";
import { calculateDistanceKm } from "../common/geo.util";
import { PRISMA } from "../prisma/prisma.module";
import { AGENDA_BOOKING_STATUSES } from "./commitments";
import { WeatherService } from "./weather.service";

const ZONE_DEMAND_DAYS = 30;
/** Un momento è "richiesto" da almeno 3 richieste: meno è rumore. */
const ZONE_DEMAND_MIN_TIP = 3;

/**
 * I due momenti della settimana più richiesti, dalle date preferite dei
 * clienti (giorno della settimana + parte del giorno). Le richieste senza
 * data preferita contano nel totale ma non nei momenti.
 */
export function zoneDemandTips(requests: { preferredDate: Date | null; preferredTimeSlot: string | null }[]): ZoneDemandTip[] {
  const counts = new Map<string, ZoneDemandTip>();
  for (const request of requests) {
    if (!request.preferredDate || !request.preferredTimeSlot) continue;
    const weekday = request.preferredDate.getUTCDay();
    const part: DayPart = dayPartOf(request.preferredTimeSlot.slice(0, 5));
    const key = `${weekday}-${part}`;
    const current = counts.get(key) ?? { weekday, part, count: 0 };
    counts.set(key, { ...current, count: current.count + 1 });
  }
  return [...counts.values()]
    .filter((tip) => tip.count >= ZONE_DEMAND_MIN_TIP)
    .sort((a, b) => b.count - a.count || a.weekday - b.weekday)
    .slice(0, 2);
}

/** Comuni entro il raggio di lavoro, per contare le richieste in zona. */
export function comuniWithinRadius(latitude: number, longitude: number, radiusKm: number): string[] {
  return ITALIAN_COMUNI.filter((c) => calculateDistanceKm(latitude, longitude, c.lat, c.lon) <= radiusKm).map((c) => c.name);
}

@Injectable()
export class AgendaService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly weatherService: WeatherService,
  ) {}

  private readonly logger = new Logger(AgendaService.name);

  /** Settimana tipo salvata, o quella proposta se non c'è (o non è più valida). */
  async weekTemplate(userId: string): Promise<AgendaWeekTemplateState> {
    const profile = await this.prisma.professionalProfile.findUnique({
      where: { userId },
      select: { agendaWeekTemplate: true, agendaTemplateFilledUntil: true },
    });
    if (!profile) throw new NotFoundException("Profilo professionista non trovato.");
    const parsed = agendaWeekTemplateSchema.safeParse(profile.agendaWeekTemplate);
    return { template: parsed.success ? parsed.data : DEFAULT_WEEK_TEMPLATE, active: profile.agendaTemplateFilledUntil !== null, changedDays: 0 };
  }

  /**
   * Salva la settimana tipo e la porta subito nei prossimi 63 giorni
   * (docs/CHANGELOG.md §323): da qui in avanti vale per tutte le settimane.
   */
  async saveWeekTemplate(userId: string, template: AgendaWeekTemplate): Promise<AgendaWeekTemplateState> {
    const profile = await this.prisma.professionalProfile.findUnique({
      where: { userId },
      select: { id: true, agendaWeekTemplate: true, agendaTemplateFilledUntil: true },
    });
    if (!profile) throw new NotFoundException("Profilo professionista non trovato.");
    const previousParsed = agendaWeekTemplateSchema.safeParse(profile.agendaWeekTemplate);
    // Prima attivazione: nessun giorno "già riempito", la settimana di prima non conta.
    const previous = profile.agendaTemplateFilledUntil && previousParsed.success ? previousParsed.data : null;
    const changedDays = await this.syncWeekTemplate(profile.id, template, previous, profile.agendaTemplateFilledUntil);
    return { template, active: true, changedDays };
  }

  /** Ogni notte la settimana tipo riempie i giorni che entrano nei prossimi 63. */
  @Cron("30 2 * * *", { timeZone: "Europe/Rome" })
  async extendWeekTemplates(): Promise<void> {
    const profiles = await this.prisma.professionalProfile.findMany({
      where: { agendaTemplateFilledUntil: { not: null }, deletedAt: null },
      select: { id: true, agendaWeekTemplate: true, agendaTemplateFilledUntil: true },
    });
    for (const profile of profiles) {
      const parsed = agendaWeekTemplateSchema.safeParse(profile.agendaWeekTemplate);
      if (!parsed.success) continue;
      try {
        await this.syncWeekTemplate(profile.id, parsed.data, parsed.data, profile.agendaTemplateFilledUntil);
      } catch (err) {
        this.logger.error(`Settimana tipo non estesa per ${profile.id}`, err instanceof Error ? err.stack : String(err));
      }
    }
  }

  private async syncWeekTemplate(
    professionalProfileId: string,
    template: AgendaWeekTemplate,
    previous: AgendaWeekTemplate | null,
    filledUntil: Date | null,
    now = new Date(),
  ): Promise<number> {
    const today = wallClockToday(now);
    const dates: string[] = [];
    for (let i = 0; i < PUBLIC_AGENDA_DAYS; i++) {
      const date = new Date(today);
      date.setUTCDate(date.getUTCDate() + i);
      dates.push(date.toISOString().slice(0, 10));
    }
    const lastDate = new Date(`${dates[dates.length - 1]}T00:00:00.000Z`);
    const windowEnd = new Date(lastDate);
    windowEnd.setUTCDate(windowEnd.getUTCDate() + 1);
    return this.prisma.$transaction(async (tx) => {
      const [slots, exceptions, bookings] = await Promise.all([
        tx.availabilitySlot.findMany({ where: { professionalProfileId, OR: [{ date: null }, { date: { gte: today } }] } }),
        tx.availabilityException.findMany({ where: { professionalProfileId, date: { gte: today } }, select: { date: true } }),
        tx.booking.findMany({
          where: { professionalProfileId, status: { in: [...AGENDA_BOOKING_STATUSES] }, scheduledAt: { gte: today, lt: windowEnd } },
          select: { scheduledAt: true },
        }),
      ]);
      const sync = weekTemplateSync({
        template,
        previous,
        dates,
        filledUntil: filledUntil ? filledUntil.toISOString().slice(0, 10) : null,
        existing: slots.map((slot) => ({
          id: slot.id,
          dayOfWeek: slot.dayOfWeek,
          date: slot.date ? slot.date.toISOString().slice(0, 10) : null,
          start: slot.startTime,
          end: slot.endTime,
          allowsHome: slot.allowsHome,
          allowsOnline: slot.allowsOnline,
          homeMax: slot.homeMaxBookings,
          onlineMax: slot.onlineMaxBookings,
          fromWeekTemplate: slot.fromWeekTemplate,
        })),
        closedDates: new Set(exceptions.map((e) => e.date.toISOString().slice(0, 10))),
        bookedDates: new Set(bookings.map((b) => b.scheduledAt.toISOString().slice(0, 10))),
      });
      if (sync.deleteIds.length) await tx.availabilitySlot.deleteMany({ where: { id: { in: sync.deleteIds }, professionalProfileId } });
      if (sync.added.length) {
        await tx.availabilitySlot.createMany({
          data: sync.added.map((slot) => ({
            professionalProfileId,
            dayOfWeek: slot.dayOfWeek,
            date: new Date(`${slot.date}T00:00:00.000Z`),
            startTime: slot.start,
            endTime: slot.end,
            allowsHome: slot.allowsHome,
            allowsOnline: slot.allowsOnline,
            homeMaxBookings: slot.allowsHome ? (slot.homeMax ?? 1) : null,
            onlineMaxBookings: slot.allowsOnline ? (slot.onlineMax ?? 1) : null,
            fromWeekTemplate: true,
          })),
        });
      }
      const nextFilledUntil = filledUntil && filledUntil > lastDate ? filledUntil : lastDate;
      await tx.professionalProfile.update({
        where: { id: professionalProfileId },
        data: { agendaWeekTemplate: template as unknown as Prisma.InputJsonValue, agendaTemplateFilledUntil: nextFilledUntil },
      });
      return sync.changedDays;
    });
  }

  /** Icone meteo dei prossimi giorni sulla zona del professionista. */
  async weather(userId: string): Promise<WeatherDayAlert[]> {
    const profile = await this.prisma.professionalProfile.findUnique({ where: { userId }, select: { latitude: true, longitude: true } });
    if (!profile) throw new NotFoundException("Profilo professionista non trovato.");
    return this.weatherService.alerts(profile.latitude, profile.longitude);
  }

  /**
   * Richieste in zona: stessi lavori, ultimi 30 giorni, nei comuni entro il
   * raggio di lavoro (solo la sua città se il profilo non ha coordinate).
   */
  async zoneDemand(userId: string, now = new Date()): Promise<ZoneDemand> {
    const profile = await this.prisma.professionalProfile.findUnique({
      where: { userId },
      select: {
        city: true,
        latitude: true,
        longitude: true,
        engagementRadiusKm: true,
        categoryId: true,
        category: { select: { label: true } },
        extraCategories: { select: { id: true } },
      },
    });
    if (!profile) throw new NotFoundException("Profilo professionista non trovato.");
    const hasPosition = !(profile.latitude === 0 && profile.longitude === 0);
    const cities = hasPosition ? comuniWithinRadius(profile.latitude, profile.longitude, profile.engagementRadiusKm) : [];
    if (!cities.some((c) => c.toLowerCase() === profile.city.toLowerCase())) cities.push(profile.city);
    const categoryIds = [profile.categoryId, ...profile.extraCategories.map((c) => c.id)];
    const requests = await this.prisma.guidedRequest.findMany({
      where: {
        categoryId: { in: categoryIds },
        city: { in: cities, mode: "insensitive" },
        createdAt: { gte: new Date(now.getTime() - ZONE_DEMAND_DAYS * 24 * 60 * 60 * 1000) },
        hiddenAt: null,
      },
      select: { preferredDate: true, preferredTimeSlot: true },
    });
    if (requests.length < ZONE_DEMAND_MIN_REQUESTS) return { status: "coming" };
    return {
      status: "ready",
      city: profile.city,
      radiusKm: hasPosition ? Math.round(profile.engagementRadiusKm) : null,
      categoryLabel: profile.extraCategories.length === 0 ? profile.category.label : null,
      total: requests.length,
      tips: zoneDemandTips(requests),
    };
  }
}
