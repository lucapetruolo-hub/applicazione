import { BadRequestException, Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import { DailyBudget } from "../common/daily-budget";

const TIMEOUT_MS = 5000;
const MAX_MARKERS = 60;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
/** Circa 300 immagini da ~100 KB: una trentina di MB al massimo. */
const CACHE_MAX = 300;
/** Immagini nuove chieste a Google al giorno (§293); quelle già pronte non contano. */
const DAILY_LIMIT = 2000;
const PIN_COLOR = "0x189A63";
/** Raggio richieste standard e urgenti (stessi colori della mappa interattiva). */
const CIRCLE_STYLES = ["color:0x3D6B3ECC|weight:2|fillcolor:0x3D6B3E1F", "color:0xD9A441CC|weight:2|fillcolor:0xD9A44114"];

export type StaticMapInput = {
  width: number;
  height: number;
  markers: [number, number][];
  center?: [number, number];
  zoom?: number;
  radiiKm: number[];
};

const round = (value: number) => Math.round(value * 1e5) / 1e5;
const point = ([lat, lng]: [number, number]) => `${round(lat)},${round(lng)}`;

function parsePoint(raw: string): [number, number] | null {
  const [lat, lng] = raw.split(",").map(Number);
  if (lat === undefined || lng === undefined || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return [lat, lng];
}

/** Legge e controlla i parametri dell'indirizzo (`size`, `m`, `c`, `z`, `r`). */
export function parseStaticMapQuery(query: { size?: string; m?: string; c?: string; z?: string; r?: string }): StaticMapInput {
  const sizeMatch = /^(\d{2,3})x(\d{2,3})$/.exec(query.size ?? "");
  const width = sizeMatch ? Number(sizeMatch[1]) : NaN;
  const height = sizeMatch ? Number(sizeMatch[2]) : NaN;
  if (!(width >= 100 && width <= 640 && height >= 100 && height <= 640)) throw new BadRequestException("Dimensioni non valide.");
  const markers = (query.m ?? "")
    .split(";")
    .filter(Boolean)
    .slice(0, MAX_MARKERS)
    .map(parsePoint);
  if (markers.some((marker) => marker === null)) throw new BadRequestException("Punti non validi.");
  const center = query.c ? parsePoint(query.c) : null;
  if (query.c && !center) throw new BadRequestException("Centro non valido.");
  const zoom = query.z !== undefined ? Number(query.z) : undefined;
  if (zoom !== undefined && !(Number.isInteger(zoom) && zoom >= 3 && zoom <= 18)) throw new BadRequestException("Zoom non valido.");
  const radiiKm = (query.r ?? "").split(",").filter(Boolean).slice(0, 2).map(Number);
  if (radiiKm.some((km) => !(km > 0 && km <= 100))) throw new BadRequestException("Raggio non valido.");
  if (radiiKm.length > 0 && !center) throw new BadRequestException("Il raggio richiede un centro.");
  if (markers.length === 0 && !center) throw new BadRequestException("Niente da mostrare.");
  return { width, height, markers: markers as [number, number][], center: center ?? undefined, zoom, radiiKm };
}

/** Cerchio come poligono di 36 punti (le mappe statiche non hanno cerchi). */
export function circlePath([lat, lng]: [number, number], radiusKm: number): string {
  const points: string[] = [];
  const latDeg = radiusKm / 110.574;
  const lngDeg = radiusKm / (111.32 * Math.cos((lat * Math.PI) / 180));
  for (let i = 0; i <= 36; i++) {
    const angle = (2 * Math.PI * i) / 36;
    points.push(point([lat + latDeg * Math.sin(angle), lng + lngDeg * Math.cos(angle)]));
  }
  return points.join("|");
}

/** Indirizzo di Google Maps Static API, senza la chiave. */
export function staticMapGoogleParams(input: StaticMapInput): URLSearchParams {
  const params = new URLSearchParams({ size: `${input.width}x${input.height}`, scale: "2", language: "it", region: "IT", maptype: "roadmap" });
  if (input.markers.length > 0) params.append("markers", `size:mid|color:${PIN_COLOR}|${input.markers.map(point).join("|")}`);
  input.radiiKm.forEach((km, index) => params.append("path", `${CIRCLE_STYLES[index]}|${circlePath(input.center!, km)}`));
  if (input.center && input.zoom !== undefined) {
    params.set("center", point(input.center));
    params.set("zoom", String(input.zoom));
  } else if (input.center) {
    // Inquadra il luogo cercato insieme a tutti i segnaposto.
    params.set("visible", [input.center, ...input.markers].map(point).join("|"));
  }
  return params;
}

/**
 * Immagine fissa della mappa preparata dal nostro server (docs/CHANGELOG.md
 * §265): si mostra a chi non ha ancora accettato i servizi Google, senza
 * caricare nulla di Google nel browser. Maps Static API con la chiave server
 * `GOOGLE_MAPS_API_KEY`.
 */
@Injectable()
export class StaticMapService {
  private readonly logger = new Logger(StaticMapService.name);
  /**
   * Immagini già preparate, per un giorno: la stessa ricerca vista da più
   * persone costa una sola richiesta a Google. In memoria, al massimo
   * `CACHE_MAX` immagini (le più vecchie escono per prime).
   */
  private readonly cache = new Map<string, { buffer: Buffer; contentType: string; expiresAt: number }>();
  private readonly budget = new DailyBudget(DAILY_LIMIT, () =>
    this.logger.error("Tetto giornaliero delle mappe fisse raggiunto: fino a mezzanotte compare \"Mappa non disponibile\"."),
  );

  async image(input: StaticMapInput, now = Date.now()): Promise<{ buffer: Buffer; contentType: string }> {
    const key = process.env.GOOGLE_MAPS_API_KEY?.trim();
    if (!key) throw new ServiceUnavailableException("Mappa non disponibile.");
    const params = staticMapGoogleParams(input);
    const cacheKey = params.toString();
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > now) return cached;
    if (cached) this.cache.delete(cacheKey);
    if (!this.budget.take(new Date(now))) throw new ServiceUnavailableException("Mappa non disponibile.");
    const image = await this.fetchImage(params, key);
    this.cache.set(cacheKey, { ...image, expiresAt: now + CACHE_TTL_MS });
    while (this.cache.size > CACHE_MAX) this.cache.delete(this.cache.keys().next().value!);
    return image;
  }

  private async fetchImage(params: URLSearchParams, key: string): Promise<{ buffer: Buffer; contentType: string }> {
    params.set("key", key);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await fetch(`https://maps.googleapis.com/maps/api/staticmap?${params.toString()}`, { signal: controller.signal });
      const contentType = response.headers.get("content-type") ?? "";
      if (!response.ok || !contentType.startsWith("image/")) {
        this.logger.error(`Google Static Maps ha risposto ${response.status}: ${(await response.text()).slice(0, 300)}`);
        throw new ServiceUnavailableException("Mappa non disponibile.");
      }
      return { buffer: Buffer.from(await response.arrayBuffer()), contentType };
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      this.logger.warn(`Google Static Maps non raggiungibile: ${error instanceof Error ? error.message : error}`);
      throw new ServiceUnavailableException("Mappa non disponibile.");
    } finally {
      clearTimeout(timeout);
    }
  }
}
