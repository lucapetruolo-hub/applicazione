import { Injectable, Logger } from "@nestjs/common";
import { WEATHER_ALWAYS_DAYS, type DayForecast, type WeatherAlertKind, type WeatherCondition, type WeatherDayAlert } from "@professionisti/shared";

const TIMEOUT_MS = 5000;
/** Previsioni fresche per 3 ore: il tempo del giorno cambia poco e ogni chiamata conta nel tetto di Open-Meteo. */
const CACHE_TTL_MS = 3 * 60 * 60 * 1000;
/** Dopo un errore per una zona, niente nuovi tentativi per 15 minuti. */
const RETRY_AFTER_ERROR_MS = 15 * 60 * 1000;
/** Tetto esaurito (429): nessuna chiamata per un'ora, si usano le ultime previsioni ricevute. */
const PAUSE_AFTER_LIMIT_MS = 60 * 60 * 1000;
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
    temperature_2m_max?: (number | null)[];
    temperature_2m_min?: (number | null)[];
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

/** "AAAA-MM-GG" spostato di `days` giorni. */
function addDaysIso(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

/** Oggi in Italia come "AAAA-MM-GG". */
export function romeToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/**
 * Icone dell'agenda: da oggi a dopodomani sempre, anche col sereno, così un
 * giorno senza icona non sembra un errore; più avanti solo col maltempo, che è
 * l'avviso utile per organizzarsi (docs/changelog/2026-11-18-meteo-tre-giorni.md).
 * `today` è il giorno italiano: la cache può tenere previsioni di ieri.
 */
export function weatherAlerts(response: OpenMeteoDaily, today: string = romeToday()): WeatherDayAlert[] {
  const daily = response.daily;
  if (!daily?.time) return [];
  const lastAlways = addDaysIso(today, WEATHER_ALWAYS_DAYS - 1);
  const alerts: WeatherDayAlert[] = [];
  daily.time.forEach((date, i) => {
    const code = daily.weather_code?.[i];
    const rain = daily.precipitation_probability_max?.[i];
    const gusts = daily.wind_gusts_10m_max?.[i];
    if (date >= today && date <= lastAlways) {
      // Senza codice meteo il cielo non si sa: meglio nessuna icona che un "Nuvoloso" inventato.
      if (code != null || gusts != null) alerts.push({ date, kind: weatherCondition(code, rain, gusts) });
      return;
    }
    const kind = weatherAlertKind(code, rain, gusts);
    if (kind) alerts.push({ date, kind });
  });
  return alerts;
}

/** Tempo del giorno per "Oggi": prima i fenomeni dell'agenda, poi il cielo. */
export function weatherCondition(code: number | null | undefined, rainProbability: number | null | undefined, gustsKmh: number | null | undefined): WeatherCondition {
  const alert = weatherAlertKind(code, rainProbability, gustsKmh);
  if (alert) return alert;
  if (code === 0) return "clear";
  if (code === 1 || code === 2) return "partly";
  return "cloudy";
}

export function dayForecasts(response: OpenMeteoDaily): DayForecast[] {
  const daily = response.daily;
  if (!daily?.time) return [];
  const round = (value: number | null | undefined) => (value == null ? null : Math.round(value));
  return daily.time.map((date, i) => ({
    date,
    condition: weatherCondition(daily.weather_code?.[i], daily.precipitation_probability_max?.[i], daily.wind_gusts_10m_max?.[i]),
    tempMax: round(daily.temperature_2m_max?.[i]),
    tempMin: round(daily.temperature_2m_min?.[i]),
  }));
}

/**
 * Previsioni per l'icona meteo dell'agenda (docs/CHANGELOG.md §288):
 * Open-Meteo, gratuito e senza chiave, chiamato dal nostro server così il
 * browser non contatta nessun servizio esterno (niente consenso cookie).
 * Mai bloccante: se non risponde, nessuna icona. Le stesse previsioni danno
 * il meteo dei prossimi giorni in "Oggi" (§333).
 */
@Injectable()
export class WeatherService {
  private readonly logger = new Logger(WeatherService.name);
  private readonly cache = new Map<string, { at: number; response: OpenMeteoDaily }>();
  private readonly failedAt = new Map<string, number>();
  private pausedUntil = 0;

  async alerts(latitude: number, longitude: number): Promise<WeatherDayAlert[]> {
    return weatherAlerts(await this.daily(latitude, longitude));
  }

  async forecast(latitude: number, longitude: number): Promise<DayForecast[]> {
    return dayForecasts(await this.daily(latitude, longitude));
  }

  private async daily(latitude: number, longitude: number): Promise<OpenMeteoDaily> {
    // Circa un chilometro di precisione: basta per il meteo e riusa la cache tra vicini.
    const key = `${latitude.toFixed(2)},${longitude.toFixed(2)}`;
    const cached = this.cache.get(key);
    const now = Date.now();
    if (cached && now - cached.at < CACHE_TTL_MS) return cached.response;
    // Se il servizio ha appena dato errore, le ultime previsioni ricevute valgono più di nessuna icona
    // (docs/changelog/2026-11-18-meteo-tre-giorni.md: tetto giornaliero esaurito su Render).
    if (now < this.pausedUntil || now - (this.failedAt.get(key) ?? 0) < RETRY_AFTER_ERROR_MS) return cached?.response ?? {};

    const apiKey = process.env.OPEN_METEO_API_KEY?.trim();
    // Con la chiave dell'abbonamento (uso commerciale) l'indirizzo è un altro e non c'è il tetto condiviso.
    const url = new URL(apiKey ? "https://customer-api.open-meteo.com/v1/forecast" : "https://api.open-meteo.com/v1/forecast");
    url.searchParams.set("latitude", latitude.toFixed(2));
    url.searchParams.set("longitude", longitude.toFixed(2));
    url.searchParams.set("daily", "weather_code,precipitation_probability_max,wind_gusts_10m_max,temperature_2m_max,temperature_2m_min");
    url.searchParams.set("timezone", "Europe/Rome");
    url.searchParams.set("forecast_days", "14");
    if (apiKey) url.searchParams.set("apikey", apiKey);
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (!response.ok) {
        if (response.status === 429) this.pausedUntil = now + PAUSE_AFTER_LIMIT_MS;
        this.failedAt.set(key, now);
        this.logger.warn(`Open-Meteo ha risposto ${response.status}${response.status === 429 ? ": tetto esaurito, pausa di un'ora" : ""}.`);
        return cached?.response ?? {};
      }
      const daily = (await response.json()) as OpenMeteoDaily;
      if (this.cache.size >= CACHE_MAX && !this.cache.has(key)) this.cache.delete(this.cache.keys().next().value as string);
      this.cache.set(key, { at: now, response: daily });
      this.failedAt.delete(key);
      return daily;
    } catch (err) {
      this.failedAt.set(key, now);
      this.logger.warn(`Open-Meteo non raggiungibile: ${err instanceof Error ? err.message : String(err)}`);
      return cached?.response ?? {};
    }
  }
}
