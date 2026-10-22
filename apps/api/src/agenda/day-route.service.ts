import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import type { PrismaClient } from "@professionisti/database";
import { findComuneByName, type DayRoute, type DayRouteLeg, type DayRouteStop } from "@professionisti/shared";
import { PRISMA } from "../prisma/prisma.module";
import { GeocodingService, type GeocodedPoint } from "../geocoding/geocoding.service";

const DAY_MS = 24 * 60 * 60_000;
const TIMEOUT_MS = 5000;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CACHE_MAX = 2000;
/** Stima senza Google: strade circa il 30% più lunghe della linea d'aria, a 40 km/h di media. */
const ROAD_FACTOR = 1.3;
const AVERAGE_KMH = 40;
const DEFAULT_DURATION_MIN = 60;

type Point = { latitude: number; longitude: number };

export function distanceKm(a: Point, b: Point): number {
  const rad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = rad(b.latitude - a.latitude);
  const dLng = rad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/** Tempo e strada stimati dalla distanza, arrotondati per eccesso a 5 minuti. */
export function estimateLeg(a: Point, b: Point): { minutes: number; km: number } {
  const km = distanceKm(a, b) * ROAD_FACTOR;
  return { minutes: Math.max(5, Math.ceil(((km / AVERAGE_KMH) * 60) / 5) * 5), km: Math.round(km * 10) / 10 };
}

/** Tempo libero tra due tappe e se basta per arrivare (docs/CHANGELOG.md §279). */
export function legTiming(previous: Pick<DayRouteStop, "start" | "end">, next: Pick<DayRouteStop, "start">, minutes: number): Pick<DayRouteLeg, "gapMinutes" | "tight"> {
  const previousEnd = previous.end ? new Date(previous.end).getTime() : new Date(previous.start).getTime() + DEFAULT_DURATION_MIN * 60_000;
  const gapMinutes = Math.round((new Date(next.start).getTime() - previousEnd) / 60_000);
  return { gapMinutes, tight: minutes > gapMinutes };
}

/**
 * "Giro intelligente" (docs/CHANGELOG.md §279, richiesta dell'utente): le
 * tappe di un giorno nell'ordine degli orari, il tempo di strada tra l'una e
 * l'altra e un avviso quando non basta. Tempi da Google Routes API con la
 * chiave del server; senza (o se non risponde) una stima dalla distanza,
 * mostrata come "circa". Solo i lavori a domicilio: quelli online non
 * richiedono spostamenti.
 */
@Injectable()
export class DayRouteService {
  private readonly logger = new Logger(DayRouteService.name);
  private readonly pointCache = new Map<string, { at: number; point: GeocodedPoint | null }>();
  private readonly legCache = new Map<string, { at: number; minutes: number; km: number }>();

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly geocodingService: GeocodingService,
  ) {}

  async dayRoute(userId: string, date: string): Promise<DayRoute> {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new BadRequestException("Data non valida.");
    const profile = await this.prisma.professionalProfile.findUnique({ where: { userId }, select: { id: true } });
    if (!profile) throw new NotFoundException("Profilo professionista non trovato.");
    const from = new Date(`${date}T00:00:00.000Z`);
    const to = new Date(from.getTime() + DAY_MS);

    const [bookings, externalJobs] = await Promise.all([
      this.prisma.booking.findMany({
        where: { professionalProfileId: profile.id, scheduledAt: { gte: from, lt: to }, status: { in: ["PENDING", "CONFIRMED", "COMPLETED"] }, NOT: { serviceMode: "ONLINE" } },
        select: {
          id: true,
          scheduledAt: true,
          scheduledEndAt: true,
          street: true,
          houseNumber: true,
          postalCode: true,
          city: true,
          recipientName: true,
          recipientSurname: true,
          client: { select: { name: true, surname: true } },
          quote: { select: { guidedRequest: { select: { address: true, city: true } } } },
        },
      }),
      this.prisma.externalJob.findMany({
        where: { professionalProfileId: profile.id, scheduledAt: { gte: from, lt: to }, status: { in: ["SCHEDULED", "COMPLETED"] } },
        select: { id: true, scheduledAt: true, scheduledEndAt: true, clientName: true, address: true },
      }),
    ]);

    const candidates = [
      ...bookings.map((b) => {
        const street = b.street && b.houseNumber ? `${b.street} ${b.houseNumber}, ${[b.postalCode, b.city].filter(Boolean).join(" ")}` : null;
        const name = [b.recipientName ?? b.client.name, b.recipientName ? b.recipientSurname : b.client.surname].filter(Boolean).join(" ");
        return {
          key: `booking-${b.id}`,
          start: b.scheduledAt,
          end: b.scheduledEndAt,
          title: name || "Cliente",
          address: street ?? b.quote?.guidedRequest?.address ?? null,
          city: b.city ?? b.quote?.guidedRequest?.city ?? null,
        };
      }),
      ...externalJobs.map((j) => ({ key: `external-${j.id}`, start: j.scheduledAt, end: j.scheduledEndAt, title: j.clientName, address: j.address, city: null })),
    ].sort((a, b) => a.start.getTime() - b.start.getTime());

    const stops: DayRouteStop[] = [];
    for (const candidate of candidates) {
      const located = await this.locate(candidate.address, candidate.city);
      if (!located) continue;
      stops.push({
        key: candidate.key,
        start: candidate.start.toISOString(),
        end: candidate.end?.toISOString() ?? null,
        title: candidate.title,
        address: candidate.address,
        latitude: located.point.latitude,
        longitude: located.point.longitude,
        approximate: located.approximate,
      });
    }

    const legs: DayRouteLeg[] = [];
    for (let i = 1; i < stops.length; i++) {
      const previous = stops[i - 1]!;
      const next = stops[i]!;
      const travel = await this.travel(previous, next);
      legs.push({ ...travel, ...legTiming(previous, next, travel.minutes) });
    }
    return { date, stops, legs };
  }

  /** Coordinate dell'indirizzo, o del centro del comune se non si trova. */
  private async locate(address: string | null, city: string | null): Promise<{ point: GeocodedPoint; approximate: boolean } | null> {
    if (address?.trim()) {
      const key = address.trim().toLowerCase();
      const cached = this.pointCache.get(key);
      let point: GeocodedPoint | null;
      if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
        point = cached.point;
      } else {
        point = await this.geocodingService.geocodeAddress(address);
        if (this.pointCache.size >= CACHE_MAX) this.pointCache.delete(this.pointCache.keys().next().value as string);
        this.pointCache.set(key, { at: Date.now(), point });
      }
      if (point) return { point, approximate: false };
    }
    const comune = city ? findComuneByName(city) : undefined;
    return comune ? { point: { latitude: comune.lat, longitude: comune.lon }, approximate: true } : null;
  }

  private async travel(a: Point, b: Point): Promise<Pick<DayRouteLeg, "minutes" | "km" | "estimated">> {
    const key = [a.latitude, a.longitude, b.latitude, b.longitude].map((n) => n.toFixed(4)).join(",");
    const cached = this.legCache.get(key);
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) return { minutes: cached.minutes, km: cached.km, estimated: false };
    const routed = await this.googleRoute(a, b);
    if (!routed) return { ...estimateLeg(a, b), estimated: true };
    if (this.legCache.size >= CACHE_MAX) this.legCache.delete(this.legCache.keys().next().value as string);
    this.legCache.set(key, { at: Date.now(), ...routed });
    return { ...routed, estimated: false };
  }

  /** Google Routes API: serve "Routes API" abilitata sulla chiave del server. */
  private async googleRoute(a: Point, b: Point): Promise<{ minutes: number; km: number } | null> {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) return null;
    try {
      const response = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": "routes.duration,routes.distanceMeters" },
        body: JSON.stringify({
          origin: { location: { latLng: { latitude: a.latitude, longitude: a.longitude } } },
          destination: { location: { latLng: { latitude: b.latitude, longitude: b.longitude } } },
          travelMode: "DRIVE",
          languageCode: "it",
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!response.ok) {
        // 403 = Routes API non abilitata sulla chiave: si resta sulla stima.
        this.logger.warn(`Google Routes ha risposto ${response.status}: uso la stima dalla distanza.`);
        return null;
      }
      const data = (await response.json()) as { routes?: { duration?: string; distanceMeters?: number }[] };
      const route = data.routes?.[0];
      const seconds = route?.duration ? Number(route.duration.replace(/s$/, "")) : NaN;
      if (!route || !Number.isFinite(seconds)) return null;
      return { minutes: Math.max(1, Math.round(seconds / 60)), km: Math.round((route.distanceMeters ?? 0) / 100) / 10 };
    } catch (err) {
      this.logger.warn(`Google Routes non raggiungibile: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  }
}
