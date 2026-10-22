import { Injectable, Logger } from "@nestjs/common";
import type { WeatherAlertKind, WeatherDayAlert } from "@professionisti/shared";

const TIMEOUT_MS = 5000;
const CACHE_TTL_MS = 60 * 60 * 1000;
const CACHE_MAX = 500;
/** Sotto questa probabilità la pioggia non vale un'icona. */
const RAIN_MIN_PROBABILITY = 50;
/** Raffiche da "vento forte" (km/h): scale, tetti e giardini diventano pericolosi. */
const STRONG_WIND_KMH = 60;

type OpenMeteoDaily = {
  daily?: {
    time?: string[];
    weather_code?: (number | null)[];
    precipitation_probability_max?: (number | null)[];
    wind_gusts_10m_max?: (number | null)[];
  };
};

/**
 * Fenomeno da segnalare per un giorno, dai codici meteo WMO di Open-Meteo.
 * Prima i più pesanti: neve e temporale contano anche con poca probabilità.
 */
export function weatherAlertKind(code: number | null | undefined, rainProbability: number | null | undefined, gustsKmh: number | null | undefined): WeatherAlertKind | null {
  if (code != null) {
    if (code >= 95) return "storm";
    if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "snow";
    const rainy = (code >= 51 && code <= 67) || (code >= 80 && code <= 82);
    if (rainy && (rainProbability == null || rainProbability >= RAIN_MIN_PROBABILITY)) return "rain";
  }
  if (gustsKmh != null && gustsKmh >= STRONG_WIND_KMH) return "wind";
  if (code === 45 || code === 48) return "fog";
  return null;
}

export function weatherAlerts(response: OpenMeteoDaily): WeatherDayAlert[] {
  const daily = response.daily;
  if (!daily?.time) return [];
  const alerts: WeatherDayAlert[] = [];
  daily.time.forEach((date, i) => {
    const kind = weatherAlertKind(daily.weather_code?.[i], daily.precipitation_probability_max?.[i], daily.wind_gusts_10m_max?.[i]);
    if (kind) alerts.push({ date, kind });
  });
  return alerts;
}

/**
 * Previsioni per l'icona meteo dell'agenda (docs/CHANGELOG.md §279):
 * Open-Meteo, gratuito e senza chiave, chiamato dal nostro server così il
 * browser non contatta nessun servizio esterno (niente consenso cookie).
 * Mai bloccante: se non risponde, nessuna icona.
 */
@Injectable()
export class WeatherService {
  private readonly logger = new Logger(WeatherService.name);
  private readonly cache = new Map<string, { at: number; alerts: WeatherDayAlert[] }>();

  async alerts(latitude: number, longitude: number): Promise<WeatherDayAlert[]> {
    // Circa un chilometro di precisione: basta per il meteo e riusa la cache tra vicini.
    const key = `${latitude.toFixed(2)},${longitude.toFixed(2)}`;
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.alerts;

    const url = new URL("https://api.open-meteo.com/v1/forecast");
    url.searchParams.set("latitude", latitude.toFixed(2));
    url.searchParams.set("longitude", longitude.toFixed(2));
    url.searchParams.set("daily", "weather_code,precipitation_probability_max,wind_gusts_10m_max");
    url.searchParams.set("timezone", "Europe/Rome");
    url.searchParams.set("forecast_days", "14");
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (!response.ok) {
        this.logger.warn(`Open-Meteo ha risposto ${response.status}.`);
        return cached?.alerts ?? [];
      }
      const alerts = weatherAlerts((await response.json()) as OpenMeteoDaily);
      if (this.cache.size >= CACHE_MAX) this.cache.delete(this.cache.keys().next().value as string);
      this.cache.set(key, { at: Date.now(), alerts });
      return alerts;
    } catch (err) {
      this.logger.warn(`Open-Meteo non raggiungibile: ${err instanceof Error ? err.message : String(err)}`);
      return cached?.alerts ?? [];
    }
  }
}
