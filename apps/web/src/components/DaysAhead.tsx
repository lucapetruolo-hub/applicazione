"use client";

import { Cloud, CloudFog, CloudLightning, CloudRain, CloudSun, Snowflake, Sun, Wind } from "lucide-react";
import { WEATHER_CONDITION_LABEL, type DayAhead, type WeatherCondition } from "@professionisti/shared";

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

const DAY_NAMES = ["Oggi", "Domani", "Dopodomani"];

/**
 * Meteo di oggi, domani e dopodomani in "Oggi", con i lavori in breve per
 * oggi e domani (richiesta dell'utente, docs/CHANGELOG.md §324). Testi al
 * minimo: quanti lavori, dalle-alle, cosa e dove; il dettaglio resta nella
 * lista sotto e in agenda.
 */
export function DaysAhead({ days }: { days: DayAhead[] | null }) {
  if (days === null) {
    return (
      <div className="days-ahead" aria-hidden>
        {DAY_NAMES.map((name) => (
          <div key={name} className="days-ahead-card is-loading" />
        ))}
      </div>
    );
  }
  return (
    <ul className="days-ahead" aria-label="Meteo e lavori dei prossimi giorni">
      {days.slice(0, 3).map((day, i) => (
        <DayCard key={day.date} day={day} name={DAY_NAMES[i]!} withJobs={i < 2} />
      ))}
    </ul>
  );
}

function DayCard({ day, name, withJobs }: { day: DayAhead; name: string; withJobs: boolean }) {
  const date = new Date(`${day.date}T12:00:00Z`).toLocaleDateString("it-IT", { weekday: "short", day: "numeric", timeZone: "UTC" });
  const weather = day.weather;
  const look = weather ? CONDITION_ICONS[weather.condition] : null;
  const label = weather ? WEATHER_CONDITION_LABEL[weather.condition] : null;
  const temps = weather && weather.tempMax !== null ? `${weather.tempMax}°${weather.tempMin !== null ? ` / ${weather.tempMin}°` : ""}` : null;
  return (
    <li className="days-ahead-card">
      <span className="days-ahead-day">
        <strong>{name}</strong>
        <span>{date}</span>
      </span>
      {look ? (
        <span className="days-ahead-sky" style={{ background: `${look.color}14` }}>
          <look.icon size={26} strokeWidth={2} color={look.color} aria-hidden />
        </span>
      ) : null}
      {weather ? (
        <p className="days-ahead-weather">
          {temps ? <strong>{temps}</strong> : null}
          <span>
            {label} · {weather.place}
          </span>
        </p>
      ) : (
        <p className="days-ahead-weather">
          <span>Meteo non disponibile</span>
        </p>
      )}
      {withJobs ? <JobsLine jobs={day.jobs} /> : null}
    </li>
  );
}

function JobsLine({ jobs }: { jobs: DayAhead["jobs"] }) {
  if (jobs.count === 0) return <p className="days-ahead-jobs is-empty">Nessun lavoro</p>;
  const works = jobs.works.length > 2 ? `${jobs.works.slice(0, 2).join(", ")} e altri ${jobs.works.length - 2}` : jobs.works.join(", ");
  const places = [...jobs.places, ...(jobs.online > 0 ? ["online"] : [])];
  return (
    <div className="days-ahead-jobs">
      <strong>
        {jobs.count === 1 ? "1 lavoro" : `${jobs.count} lavori`}
        {jobs.from ? ` · ${shortTime(jobs.from)}${jobs.to && jobs.to !== jobs.from ? `–${shortTime(jobs.to)}` : ""}` : ""}
      </strong>
      {works ? <span>{works}</span> : null}
      {places.length > 0 ? <span>{places.join(", ")}</span> : null}
    </div>
  );
}

/** "08:30" → "8:30". */
function shortTime(time: string): string {
  return time.replace(/^0(\d)/, "$1");
}

/** Variante B: tre giorni in una riga sola, i lavori raggruppati sotto ogni giorno. */
export function WeatherStrip({ days }: { days: DayAhead[] | null }) {
  if (days === null) {
    return (
      <div className="weather-strip" aria-hidden>
        {DAY_NAMES.map((name) => (
          <div key={name} className="weather-chip is-loading" />
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
          <li key={day.date} className="weather-chip" title={day.weather ? `${label} · ${day.weather.place}` : label}>
            <span className="weather-chip-day">{i < 2 ? DAY_NAMES[i] : new Date(`${day.date}T12:00:00Z`).toLocaleDateString("it-IT", { weekday: "long", timeZone: "UTC" })}</span>
            <span className="weather-chip-main">
              {look ? <look.icon size={22} strokeWidth={2} color={look.color} aria-label={label} role="img" /> : null}
              {day.weather?.tempMax != null ? (
                <strong>
                  {day.weather.tempMax}°<span>{day.weather.tempMin != null ? ` ${day.weather.tempMin}°` : ""}</span>
                </strong>
              ) : null}
            </span>
            <span className="weather-chip-label">{label}</span>
          </li>
        );
      })}
    </ul>
  );
}

/** "2 lavori · 8:30–17:30 · Latina, Sezze" per l'intestazione del giorno. */
export function jobsHeadline(jobs: DayAhead["jobs"]): string {
  if (jobs.count === 0) return "Nessun lavoro";
  const places = [...jobs.places, ...(jobs.online > 0 ? ["online"] : [])];
  return [
    jobs.count === 1 ? "1 lavoro" : `${jobs.count} lavori`,
    jobs.from ? `${shortTime(jobs.from)}${jobs.to && jobs.to !== jobs.from ? `–${shortTime(jobs.to)}` : ""}` : null,
    places.join(", ") || null,
  ]
    .filter(Boolean)
    .join(" · ");
}
