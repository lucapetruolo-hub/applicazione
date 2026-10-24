"use client";

import Link from "next/link";
import { Cloud, CloudFog, CloudLightning, CloudRain, CloudSun, Snowflake, Sun, Wind } from "lucide-react";
import { formatAppointmentTime, WEATHER_CONDITION_LABEL, type DayAhead, type WeatherCondition } from "@professionisti/shared";

const CONDITION_ICONS: Record<WeatherCondition, { icon: typeof Sun; color: string }> = {
  clear: { icon: Sun, color: "#c98a00" },
  partly: { icon: CloudSun, color: "#a77b1a" },
  cloudy: { icon: Cloud, color: "#7a7068" },
  rain: { icon: CloudRain, color: "#4f6d8f" },
  storm: { icon: CloudLightning, color: "#5b4f8f" },
  snow: { icon: Snowflake, color: "#4f7f9f" },
  wind: { icon: Wind, color: "#4f6d8f" },
  fog: { icon: CloudFog, color: "#7a7068" },
};

const DAY_NAMES = ["Oggi", "Domani"];

/**
 * Meteo di oggi, domani e dopodomani in "Oggi" (richiesta dell'utente,
 * docs/CHANGELOG.md §329): una riga sola, sempre con l'icona, così il
 * prossimo lavoro resta visibile senza scorrere anche da telefono (§311).
 */
export function WeatherStrip({ days }: { days: DayAhead[] | null }) {
  if (days === null) {
    return (
      <div className="weather-strip" aria-hidden>
        {[0, 1, 2].map((i) => (
          <div key={i} className="weather-chip is-loading" />
        ))}
      </div>
    );
  }
  return (
    <ul className="weather-strip" aria-label="Meteo dei prossimi giorni">
      {days.slice(0, 3).map((day, i) => {
        const look = day.weather ? CONDITION_ICONS[day.weather.condition] : null;
        const label = day.weather ? WEATHER_CONDITION_LABEL[day.weather.condition] : "Meteo non disponibile";
        return (
          <li key={day.date}>
            {/* Tocca un giorno: l'agenda si apre su quel giorno (§329). */}
            <Link href={`/dashboard/agenda?giorno=${day.date}`} className="weather-chip" title={day.weather ? `${label} · ${day.weather.place}` : label}>
              <span className="weather-chip-day">{i < 2 ? DAY_NAMES[i] : new Date(`${day.date}T12:00:00Z`).toLocaleDateString("it-IT", { weekday: "long", timeZone: "UTC" })}</span>
              <span className="weather-chip-main">
                {look ? <look.icon size={22} strokeWidth={2} color={look.color} aria-label={label} role="img" /> : null}
                {day.weather?.tempMax != null ? (
                  <strong>
                    {day.weather.tempMax}°<span>{day.weather.tempMin != null ? ` ${day.weather.tempMin}°` : ""}</span>
                  </strong>
                ) : null}
              </span>
              <span className="weather-chip-label">{day.weather?.away ? `${label} · ${day.weather.place}` : label}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** Un lavoro nella lista di "Oggi", per il riepilogo del giorno. */
export type DayJobRow = { start: string; end: string | null; city: string | null; online: boolean };

/** "2 lavori · 8:30–17:30 · Latina, Sezze": intestazione del giorno sopra i suoi lavori. */
export function jobsHeadline(rows: DayJobRow[]): string {
  const sorted = [...rows].sort((a, b) => a.start.localeCompare(b.start));
  const first = sorted[0];
  if (!first) return "Nessun lavoro";
  const lastEnd = sorted.reduce((latest, row) => {
    const end = row.end && row.end > row.start ? row.end : row.start;
    return end > latest ? end : latest;
  }, first.start);
  const from = formatAppointmentTime(first.start);
  const to = formatAppointmentTime(lastEnd);
  const places = [...new Set(sorted.filter((row) => !row.online && row.city?.trim()).map((row) => row.city!.trim()))];
  if (sorted.some((row) => row.online)) places.push("online");
  return [sorted.length === 1 ? "1 lavoro" : `${sorted.length} lavori`, from === to ? shortTime(from) : `${shortTime(from)}–${shortTime(to)}`, places.join(", ") || null]
    .filter(Boolean)
    .join(" · ");
}

/** "08:30" → "8:30". */
function shortTime(time: string): string {
  return time.replace(/^0(\d)/, "$1");
}
