import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import type { Prisma, PrismaClient } from "@professionisti/database";
import {
  agendaWeekTemplateSchema,
  dayPartOf,
  findComuneByName,
  italianComuni,
  jobOccurrenceOn,
  starterWeekTemplate,
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
/** Oggi, domani e dopodomani (richiesta dell'utente, docs/CHANGELOG.md §333). */
const DAYS_AHEAD = 3;
/** Un momento è "richiesto" da almeno 3 richieste: meno è rumore. */
const ZONE_DEMAND_MIN_TIP = 3;

type DayJob = { start: Date; online: boolean; city: string | null };

/** Comune del primo lavoro a domicilio del giorno, per il meteo di quel giorno. */
export function firstHomeCity(jobs: DayJob[]): string | null {
  return [...jobs].sort((a, b) => a.start.getTime() - b.start.getTime()).find((job) => !job.online && job.city?.trim())?.city?.trim() ?? null;
}

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
  return italianComuni().filter((c) => calculateDistanceKm(latitude, longitude, c.lat, c.lon) <= radiusKm).map((c) => c.name);
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
      select: { agendaWeekTemplate: true, agendaTemplateFilledUntil: true, agendaStarterHoursAt: true, remoteAvailable: true },
    });
    if (!profile) throw new NotFoundException("Profilo professionista non trovato.");
    const parsed = agendaWeekTemplateSchema.safeParse(profile.agendaWeekTemplate);
    return {
      template: parsed.success ? parsed.data : starterWeekTemplate(profile.remoteAvailable),
      active: profile.agendaTemplateFilledUntil !== null,
      changedDays: 0,
      starter: profile.agendaStarterHoursAt !== null,
      online: profile.remoteAvailable,
    };
  }

  /**
   * Orari di partenza di un profilo appena creato (richiesta dell'utente,
   * docs/CHANGELOG.md §356): la settimana tipo dal lunedì al sabato 8–13 e
   * 14–20 entra subito nell'agenda, come se l'avesse salvata lui. Solo se
   * l'agenda è ancora vuota: un profilo con orari suoi non si tocca.
   */
  async applyStarterHours(professionalProfileId: string, remoteAvailable: boolean): Promise<void> {
    const [profile, slotCount] = await Promise.all([
      this.prisma.professionalProfile.findUnique({ where: { id: professionalProfileId }, select: { agendaTemplateFilledUntil: true } }),
      this.prisma.availabilitySlot.count({ where: { professionalProfileId } }),
    ]);
    if (!profile || profile.agendaTemplateFilledUntil || slotCount > 0) return;
    await this.syncWeekTemplate(professionalProfileId, starterWeekTemplate(remoteAvailable), null, null);
    await this.prisma.professionalProfile.update({ where: { id: professionalProfileId }, data: { agendaStarterHoursAt: new Date() } });
  }

  /** Fasce con posti online da oggi in poi: il profilo chiede se toglierle quando si spegne "online" (§357). */
  async onlineSlotCount(userId: string, now = new Date()): Promise<{ count: number }> {
    const professionalProfileId = await this.requireProfileId(userId);
    const count = await this.prisma.availabilitySlot.count({ where: this.futureOnlineSlots(professionalProfileId, now) });
    return { count };
  }

  /**
   * Il professionista non lavora più online e sceglie di togliere gli orari
   * online (richiesta dell'utente, docs/CHANGELOG.md §357): dalle fasce da
   * oggi in poi e dalla settimana tipo sparisce la parte online, le fasce
   * solo online si tolgono. I lavori già fissati restano.
   */
  async removeOnlineSlots(userId: string, now = new Date()): Promise<{ count: number }> {
    const professionalProfileId = await this.requireProfileId(userId);
    const future = this.futureOnlineSlots(professionalProfileId, now);
    const count = await this.prisma.availabilitySlot.count({ where: future });
    const profile = await this.prisma.professionalProfile.findUnique({ where: { id: professionalProfileId }, select: { agendaWeekTemplate: true } });
    const parsed = agendaWeekTemplateSchema.safeParse(profile?.agendaWeekTemplate);
    await this.prisma.$transaction(async (tx) => {
      await tx.availabilitySlot.deleteMany({ where: { ...future, allowsHome: false } });
      await tx.availabilitySlot.updateMany({ where: future, data: { allowsOnline: false, onlineMaxBookings: null } });
      if (parsed.success) {
        const template: AgendaWeekTemplate = {
          days: parsed.data.days.map((slots) => slots.filter((slot) => slot.allowsHome).map((slot) => ({ ...slot, allowsOnline: false, onlineMax: null }))),
        };
        await tx.professionalProfile.update({ where: { id: professionalProfileId }, data: { agendaWeekTemplate: template as unknown as Prisma.InputJsonValue } });
      }
    });
    return { count };
  }

  private futureOnlineSlots(professionalProfileId: string, now: Date) {
    return { professionalProfileId, allowsOnline: true, OR: [{ date: null }, { date: { gte: wallClockToday(now) } }] };
  }

  private async requireProfileId(userId: string): Promise<string> {
    const profile = await this.prisma.professionalProfile.findUnique({ where: { userId }, select: { id: true } });
    if (!profile) throw new NotFoundException("Profilo professionista non trovato.");
    return profile.id;
  }

  /** "Vanno bene così": il professionista tiene gli orari di partenza e l'avviso sparisce. */
  async keepStarterHours(userId: string): Promise<AgendaWeekTemplateState> {
    await this.prisma.professionalProfile.updateMany({ where: { userId }, data: { agendaStarterHoursAt: null } });
    return this.weekTemplate(userId);
  }

  /**
   * Salva la settimana tipo e la porta subito nei prossimi 63 giorni
   * (docs/CHANGELOG.md §323): da qui in avanti vale per tutte le settimane.
   */
  async saveWeekTemplate(userId: string, template: AgendaWeekTemplate): Promise<AgendaWeekTemplateState> {
    const profile = await this.prisma.professionalProfile.findUnique({
      where: { userId },
      select: { id: true, agendaWeekTemplate: true, agendaTemplateFilledUntil: true, remoteAvailable: true },
    });
    if (!profile) throw new NotFoundException("Profilo professionista non trovato.");
    const previousParsed = agendaWeekTemplateSchema.safeParse(profile.agendaWeekTemplate);
    // Prima attivazione: nessun giorno "già riempito", la settimana di prima non conta.
    const previous = profile.agendaTemplateFilledUntil && previousParsed.success ? previousParsed.data : null;
    const changedDays = await this.syncWeekTemplate(profile.id, template, previous, profile.agendaTemplateFilledUntil, new Date(), true);
    return { template, active: true, changedDays, starter: false, online: profile.remoteAvailable };
  }

  /**
   * Settimana tipo per un mese solo (richiesta dell'utente, docs/CHANGELOG.md
   * §327): riempie i giorni di quel mese da oggi in poi con le stesse regole,
   * ma le fasce diventano giorni a sé (non cambiano con la settimana di tutti
   * i mesi). La settimana di tutti i mesi resta com'era; se non è mai stata
   * salvata, si ricorda questa per riaprire l'editor.
   */
  async saveWeekTemplateForMonth(userId: string, template: AgendaWeekTemplate, month: string, now = new Date()): Promise<AgendaWeekTemplateState> {
    const profile = await this.prisma.professionalProfile.findUnique({
      where: { userId },
      select: { id: true, agendaWeekTemplate: true, agendaTemplateFilledUntil: true, remoteAvailable: true },
    });
    if (!profile) throw new NotFoundException("Profilo professionista non trovato.");
    const today = wallClockToday(now);
    const todayStr = today.toISOString().slice(0, 10);
    const first = new Date(`${month}-01T00:00:00.000Z`);
    const limit = new Date(today);
    limit.setUTCFullYear(limit.getUTCFullYear() + 1);
    if (first > limit) throw new BadRequestException("Si può scegliere al massimo un anno avanti.");
    const dates: string[] = [];
    for (const day = new Date(first); day.getUTCMonth() === first.getUTCMonth(); day.setUTCDate(day.getUTCDate() + 1)) {
      const date = day.toISOString().slice(0, 10);
      if (date >= todayStr) dates.push(date);
    }
    if (dates.length === 0) throw new BadRequestException("Quel mese è già passato.");
    const end = new Date(`${dates[dates.length - 1]}T00:00:00.000Z`);
    end.setUTCDate(end.getUTCDate() + 1);
    const changedDays = await this.prisma.$transaction(async (tx) => {
      const sync = await this.computeSync(tx, profile.id, template, null, null, dates, new Date(`${dates[0]}T00:00:00.000Z`), end);
      await this.applySync(tx, profile.id, sync, false);
      await tx.professionalProfile.update({
        where: { id: profile.id },
        data: {
          agendaStarterHoursAt: null,
          ...(profile.agendaTemplateFilledUntil ? {} : { agendaWeekTemplate: template as unknown as Prisma.InputJsonValue }),
        },
      });
      return sync.changedDays;
    });
    const saved = agendaWeekTemplateSchema.safeParse(profile.agendaTemplateFilledUntil ? profile.agendaWeekTemplate : template);
    return { template: saved.success ? saved.data : template, active: profile.agendaTemplateFilledUntil !== null, changedDays, starter: false, online: profile.remoteAvailable };
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
    clearStarter = false,
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
      const sync = await this.computeSync(tx, professionalProfileId, template, previous, filledUntil, dates, today, windowEnd);
      await this.applySync(tx, professionalProfileId, sync, true);
      const nextFilledUntil = filledUntil && filledUntil > lastDate ? filledUntil : lastDate;
      await tx.professionalProfile.update({
        where: { id: professionalProfileId },
        data: {
          agendaWeekTemplate: template as unknown as Prisma.InputJsonValue,
          agendaTemplateFilledUntil: nextFilledUntil,
          ...(clearStarter ? { agendaStarterHoursAt: null } : {}),
        },
      });
      return sync.changedDays;
    });
  }

  private async computeSync(
    tx: Prisma.TransactionClient,
    professionalProfileId: string,
    template: AgendaWeekTemplate,
    previous: AgendaWeekTemplate | null,
    filledUntil: Date | null,
    dates: string[],
    from: Date,
    to: Date,
  ) {
    const [slots, exceptions, bookings] = await Promise.all([
      tx.availabilitySlot.findMany({ where: { professionalProfileId, OR: [{ date: null }, { date: { gte: from, lt: to } }] } }),
      tx.availabilityException.findMany({ where: { professionalProfileId, date: { gte: from, lt: to } }, select: { date: true } }),
      tx.booking.findMany({
        where: { professionalProfileId, status: { in: [...AGENDA_BOOKING_STATUSES] }, scheduledAt: { gte: from, lt: to } },
        select: { scheduledAt: true },
      }),
    ]);
    return weekTemplateSync({
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
  }

  private async applySync(tx: Prisma.TransactionClient, professionalProfileId: string, sync: ReturnType<typeof weekTemplateSync>, fromWeekTemplate: boolean) {
    if (sync.deleteIds.length) await tx.availabilitySlot.deleteMany({ where: { id: { in: sync.deleteIds }, professionalProfileId } });
    if (!sync.added.length) return;
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
        fromWeekTemplate,
      })),
    });
  }

  /** Icone meteo dei prossimi giorni sulla zona del professionista. */
  async weather(userId: string): Promise<WeatherDayAlert[]> {
    const profile = await this.prisma.professionalProfile.findUnique({ where: { userId }, select: { latitude: true, longitude: true } });
    if (!profile) throw new NotFoundException("Profilo professionista non trovato.");
    return this.weatherService.alerts(profile.latitude, profile.longitude);
  }

  /**
   * Meteo di oggi, domani e dopodomani in "Oggi" (docs/CHANGELOG.md §333):
   * del comune del primo lavoro a domicilio del giorno, o della zona del
   * profilo. A Open-Meteo vanno solo le coordinate del centro del comune,
   * mai l'indirizzo del cliente. Mai bloccante: senza risposta, nessuna icona.
   */
  async daysAhead(userId: string): Promise<DayAhead[]> {
    const profile = await this.prisma.professionalProfile.findUnique({ where: { userId }, select: { id: true, city: true, latitude: true, longitude: true } });
    if (!profile) throw new NotFoundException("Profilo professionista non trovato.");
    const from = wallClockToday();
    const to = new Date(from.getTime() + DAYS_AHEAD * DAY_MS);
    const [bookings, externalJobs] = await Promise.all([
      this.prisma.booking.findMany({
        where: { professionalProfileId: profile.id, status: { in: ["PENDING", "CONFIRMED"] }, ...touchingWindow(from, to) },
        select: { scheduledAt: true, scheduledEndAt: true, serviceMode: true, city: true, quote: { select: { guidedRequest: { select: { city: true } } } } },
      }),
      this.prisma.externalJob.findMany({
        where: { professionalProfileId: profile.id, status: "SCHEDULED", ...touchingWindow(from, to) },
        select: { scheduledAt: true, scheduledEndAt: true, address: true },
      }),
    ]);
    const jobs = [
      ...bookings.map((b) => ({ start: b.scheduledAt, end: b.scheduledEndAt, online: b.serviceMode === "ONLINE", city: b.city ?? b.quote?.guidedRequest.city ?? null })),
      ...externalJobs.map((j) => ({ start: j.scheduledAt, end: j.scheduledEndAt, online: false, city: comuneInAddress(j.address) })),
    ];
    const days = Array.from({ length: DAYS_AHEAD }, (_, i) => new Date(from.getTime() + i * DAY_MS).toISOString().slice(0, 10));
    return Promise.all(
      days.map(async (date) => {
        // Un lavoro su più giorni conta in ognuno, con l'orario di quel giorno (§310).
        const dayJobs = jobs.flatMap((job) => {
          const occurrence = jobOccurrenceOn(job.start, job.end, date);
          return occurrence ? [{ ...job, start: occurrence.start }] : [];
        });
        const city = firstHomeCity(dayJobs);
        const comune = city ? findComuneByName(city) : undefined;
        const place = comune ? { name: comune.name, lat: comune.lat, lon: comune.lon } : { name: profile.city, lat: profile.latitude, lon: profile.longitude };
        const forecast = (await this.weatherService.forecast(place.lat, place.lon)).find((day) => day.date === date);
        return { date, weather: forecast ? { ...forecast, place: place.name, away: place.name.toLowerCase() !== profile.city.trim().toLowerCase() } : null };
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

