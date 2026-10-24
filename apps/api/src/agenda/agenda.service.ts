import { Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import type { Prisma, PrismaClient } from "@professionisti/database";
import {
  agendaWeekTemplateSchema,
  dayPartOf,
  findComuneByName,
  ITALIAN_COMUNI,
  jobOccurrenceOn,
  DEFAULT_WEEK_TEMPLATE,
  PUBLIC_AGENDA_DAYS,
  wallClockToday,
  weekTemplateSync,
  ZONE_DEMAND_MIN_REQUESTS,
  type AgendaWeekTemplate,
  type AgendaWeekTemplateState,
  type DayAhead,
  type DayPart,
  type WeatherDayAlert,
  type ZoneDemand,
  type ZoneDemandTip,
} from "@professionisti/shared";
import { calculateDistanceKm } from "../common/geo.util";
import { PRISMA } from "../prisma/prisma.module";
import { AGENDA_BOOKING_STATUSES, touchingWindow } from "./commitments";
import { comuneInAddress } from "./day-route.service";
import { WeatherService } from "./weather.service";

const ZONE_DEMAND_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;
/** Oggi, domani e dopodomani (richiesta dell'utente, docs/CHANGELOG.md §324). */
const DAYS_AHEAD = 3;

type DayJob = { start: Date; end: Date | null; online: boolean; city: string | null; work: string | null };

/**
 * Riepilogo dei lavori di un giorno: quanti, dalle-alle (ora di parete),
 * comuni e cosa c'è da fare, senza doppioni e nell'ordine degli orari.
 */
export function summarizeDayJobs(jobs: DayJob[]): DayAhead["jobs"] {
  const sorted = [...jobs].sort((a, b) => a.start.getTime() - b.start.getTime());
  const unique = (values: (string | null)[]) => [...new Set(values.filter((v): v is string => Boolean(v?.trim())).map((v) => v.trim()))];
  const lastEnd = sorted.reduce<Date | null>((latest, job) => {
    const end = job.end && job.end > job.start ? job.end : job.start;
    return !latest || end > latest ? end : latest;
  }, null);
  return {
    count: sorted.length,
    from: sorted[0] ? sorted[0].start.toISOString().slice(11, 16) : null,
    to: lastEnd ? lastEnd.toISOString().slice(11, 16) : null,
    places: unique(sorted.filter((job) => !job.online).map((job) => job.city)),
    works: unique(sorted.map((job) => job.work)),
    online: sorted.filter((job) => job.online).length,
  };
}
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
   * Oggi, domani e dopodomani in "Oggi" (docs/CHANGELOG.md §324): il meteo
   * del comune del primo lavoro a domicilio del giorno, o della zona del
   * profilo, e i lavori ancora da fare. Il meteo non blocca mai: se
   * Open-Meteo non risponde il giorno resta senza icona.
   */
  async daysAhead(userId: string): Promise<DayAhead[]> {
    const profile = await this.prisma.professionalProfile.findUnique({ where: { userId }, select: { id: true, city: true, latitude: true, longitude: true } });
    if (!profile) throw new NotFoundException("Profilo professionista non trovato.");
    const from = wallClockToday();
    const to = new Date(from.getTime() + DAYS_AHEAD * DAY_MS);
    const [bookings, externalJobs] = await Promise.all([
      this.prisma.booking.findMany({
        where: { professionalProfileId: profile.id, status: { in: ["PENDING", "CONFIRMED"] }, ...touchingWindow(from, to) },
        select: {
          scheduledAt: true,
          scheduledEndAt: true,
          serviceMode: true,
          city: true,
          quote: { select: { items: { select: { name: true }, take: 1 }, guidedRequest: { select: { city: true, category: { select: { label: true } } } } } },
        },
      }),
      this.prisma.externalJob.findMany({
        where: { professionalProfileId: profile.id, status: "SCHEDULED", ...touchingWindow(from, to) },
        select: { scheduledAt: true, scheduledEndAt: true, address: true, description: true },
      }),
    ]);
    const jobs = [
      ...bookings.map((b) => ({
        start: b.scheduledAt,
        end: b.scheduledEndAt,
        online: b.serviceMode === "ONLINE",
        city: b.city ?? b.quote?.guidedRequest.city ?? null,
        work: b.quote?.items[0]?.name ?? b.quote?.guidedRequest.category.label ?? null,
      })),
      ...externalJobs.map((j) => ({
        start: j.scheduledAt,
        end: j.scheduledEndAt,
        online: false,
        city: comuneInAddress(j.address),
        work: j.description ? shortWork(j.description) : null,
      })),
    ];

    const days = Array.from({ length: DAYS_AHEAD }, (_, i) => new Date(from.getTime() + i * DAY_MS).toISOString().slice(0, 10));
    const perDay = days.map((date) =>
      jobs.flatMap((job) => {
        const occurrence = jobOccurrenceOn(job.start, job.end, date);
        return occurrence ? [{ ...job, start: occurrence.start, end: occurrence.end }] : [];
      }),
    );
    return Promise.all(
      days.map(async (date, i) => {
        const summary = summarizeDayJobs(perDay[i]!);
        const comune = summary.places.map((place) => findComuneByName(place)).find(Boolean);
        const place = comune ? { name: comune.name, lat: comune.lat, lon: comune.lon } : { name: profile.city, lat: profile.latitude, lon: profile.longitude };
        const forecast = (await this.weatherService.forecast(place.lat, place.lon)).find((day) => day.date === date);
        return { date, weather: forecast ? { ...forecast, place: place.name } : null, jobs: summary };
      }),
    );
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

/** Prima frase della descrizione di un lavoro aggiunto a mano, al massimo 40 caratteri. */
function shortWork(description: string): string {
  const first = description.trim().split(/[.\n]/)[0]!.trim();
  return first.length > 40 ? `${first.slice(0, 39).trimEnd()}…` : first;
}
