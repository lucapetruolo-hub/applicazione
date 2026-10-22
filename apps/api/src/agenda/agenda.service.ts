import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma, PrismaClient } from "@professionisti/database";
import {
  agendaWeekTemplateSchema,
  dayPartOf,
  ITALIAN_COMUNI,
  DEFAULT_WEEK_TEMPLATE,
  ZONE_DEMAND_MIN_REQUESTS,
  type AgendaWeekTemplate,
  type DayPart,
  type WeatherDayAlert,
  type ZoneDemand,
  type ZoneDemandTip,
} from "@professionisti/shared";
import { calculateDistanceKm } from "../common/geo.util";
import { PRISMA } from "../prisma/prisma.module";
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

  /** Settimana tipo salvata, o quella proposta se non c'è (o non è più valida). */
  async weekTemplate(userId: string): Promise<AgendaWeekTemplate> {
    const profile = await this.prisma.professionalProfile.findUnique({ where: { userId }, select: { agendaWeekTemplate: true } });
    if (!profile) throw new NotFoundException("Profilo professionista non trovato.");
    const parsed = agendaWeekTemplateSchema.safeParse(profile.agendaWeekTemplate);
    return parsed.success ? parsed.data : DEFAULT_WEEK_TEMPLATE;
  }

  async saveWeekTemplate(userId: string, template: AgendaWeekTemplate): Promise<AgendaWeekTemplate> {
    const profile = await this.prisma.professionalProfile.findUnique({ where: { userId }, select: { id: true } });
    if (!profile) throw new NotFoundException("Profilo professionista non trovato.");
    await this.prisma.professionalProfile.update({ where: { userId }, data: { agendaWeekTemplate: template as unknown as Prisma.InputJsonValue } });
    return template;
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
