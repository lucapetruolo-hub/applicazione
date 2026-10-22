"use client";

import { useEffect, useRef } from "react";
import { CloudFog, CloudLightning, CloudRain, Snowflake, Wind } from "lucide-react";
import { WEATHER_ALERT_LABEL, type WeatherAlertKind } from "@professionisti/shared";
import { isSameDateUtc, toIsoDate, weekdayShortLabel } from "@/lib/calendarDates";

export type AgendaEventKind = "conf" | "pending" | "done" | "wait" | "ext" | "canceled";

/** Un blocco nella griglia oraria: minuti dalla mezzanotte, ora italiana. */
export type AgendaGridEvent = {
  key: string;
  date: string;
  start: number;
  end: number;
  title: string;
  detail: string;
  kind: AgendaEventKind;
  label: string;
  onPress: () => void;
};

export type AgendaFreeBand = { date: string; start: number; end: number };

export type AgendaDayNote = { text: string; tone: "free" | "full" | "off" };

const HOUR_PX = 52;
const DEFAULT_FROM = 7;
const DEFAULT_TO = 20;

const WEATHER_ICONS: Record<WeatherAlertKind, typeof CloudRain> = {
  rain: CloudRain,
  storm: CloudLightning,
  snow: Snowflake,
  wind: Wind,
  fog: CloudFog,
};

export function WeatherIcon({ kind, size = 15 }: { kind: WeatherAlertKind; size?: number }) {
  const IconComponent = WEATHER_ICONS[kind];
  return (
    <span className="ag-weather" title={WEATHER_ALERT_LABEL[kind]} role="img" aria-label={WEATHER_ALERT_LABEL[kind]}>
      <IconComponent size={size} strokeWidth={2} aria-hidden />
    </span>
  );
}

export function minutesToLabel(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

/**
 * Griglia oraria di Giorno e Settimana (docs/CHANGELOG.md §288): orari
 * liberi come fasce verdi chiare dietro agli appuntamenti, linea rossa
 * dell'ora attuale, giorni chiusi in pesca scuro, icona meteo accanto al
 * giorno. Gli orari sono "di parete" (vedi appointmentTime.ts).
 */
export function AgendaTimeGrid({
  days,
  events,
  free,
  closedDates,
  weather,
  today,
  nowMinutes,
  selectedKey,
  dayNote,
  onDayPress,
}: {
  days: Date[];
  events: AgendaGridEvent[];
  free: AgendaFreeBand[];
  closedDates: Set<string>;
  weather: Map<string, WeatherAlertKind>;
  today: Date;
  nowMinutes: number;
  selectedKey: string | null;
  dayNote: (date: string) => AgendaDayNote | null;
  onDayPress?: (date: Date) => void;
}) {
  const dateStrs = days.map(toIsoDate);
  const visible = events.filter((e) => dateStrs.includes(e.date));
  const visibleFree = free.filter((f) => dateStrs.includes(f.date));
  const earliest = Math.min(DEFAULT_FROM * 60, ...visible.map((e) => e.start), ...visibleFree.map((f) => f.start));
  const latest = Math.max(DEFAULT_TO * 60, ...visible.map((e) => e.end), ...visibleFree.map((f) => f.end));
  const fromHour = Math.floor(earliest / 60);
  const toHour = Math.min(24, Math.ceil(latest / 60));
  const height = (toHour - fromHour) * HOUR_PX;
  const y = (minutes: number) => ((minutes - fromHour * 60) / 60) * HOUR_PX;
  const columns = `52px repeat(${days.length}, minmax(0, 1fr))`;
  const todayStr = toIsoDate(today);
  const showsToday = dateStrs.includes(todayStr);

  // All'apertura la griglia scorre all'ora attuale (o al primo appuntamento), non a mezzanotte.
  const scrollRef = useRef<HTMLDivElement>(null);
  const firstStart = visible.length > 0 ? Math.min(...visible.map((e) => e.start)) : null;
  const anchor = showsToday ? nowMinutes : (firstStart ?? 8 * 60);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = Math.max(0, y(anchor) - HOUR_PX);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateStrs.join(",")]);

  return (
    <div className="ag-card ag-cal">
      <div className={days.length === 1 ? "ag-days ag-days-single" : "ag-days"} style={{ gridTemplateColumns: columns }}>
        <div aria-hidden />
        {days.map((date, index) => {
          const dateStr = dateStrs[index]!;
          const note = closedDates.has(dateStr) ? ({ text: "Chiuso", tone: "off" } as const) : dayNote(dateStr);
          const alert = weather.get(dateStr);
          const content = (
            <>
              {weekdayShortLabel(date)}
              <span className="ag-day-num">{date.getUTCDate()}</span>
              {note || alert ? (
                <span className={`ag-day-note ${note?.tone ?? ""}`}>
                  {note?.text}
                  {alert ? <WeatherIcon kind={alert} size={13} /> : null}
                </span>
              ) : null}
            </>
          );
          const className = isSameDateUtc(date, today) ? "today" : "";
          return onDayPress && days.length > 1 ? (
            <button key={dateStr} type="button" className={className} onClick={() => onDayPress(date)} aria-label={`Apri il giorno ${date.getUTCDate()}`}>
              {content}
            </button>
          ) : (
            <div key={dateStr} className={className}>
              {content}
            </div>
          );
        })}
      </div>
      <div className="ag-grid-scroll" ref={scrollRef}>
        <div className="ag-grid" style={{ gridTemplateColumns: columns }}>
          <div className="ag-hours" aria-hidden>
            {Array.from({ length: toHour - fromHour }, (_, i) => (
              <div key={i} style={{ height: HOUR_PX }}>
                {i === 0 ? "" : `${String(fromHour + i).padStart(2, "0")}:00`}
              </div>
            ))}
          </div>
          {days.map((date, index) => {
            const dateStr = dateStrs[index]!;
            const closed = closedDates.has(dateStr);
            const past = dateStr < todayStr;
            return (
              <div key={dateStr} className={`ag-col${closed ? " closed" : past ? " past" : ""}`} style={{ height }}>
                {Array.from({ length: toHour - fromHour - 1 }, (_, i) => (
                  <div key={i} className="hl" style={{ top: (i + 1) * HOUR_PX }} />
                ))}
                {closed ? <div className="closed-label">Chiuso</div> : null}
                {visibleFree
                  .filter((band) => band.date === dateStr)
                  .map((band) => (
                    <div key={`${band.start}-${band.end}`} className="ag-free" style={{ top: y(band.start) + 2, height: Math.max(8, y(band.end) - y(band.start) - 4) }}>
                      {y(band.end) - y(band.start) >= 30 ? <span>Libero</span> : null}
                    </div>
                  ))}
                {visible
                  .filter((event) => event.date === dateStr)
                  .map((event) => {
                    const blockHeight = Math.max(26, y(event.end) - y(event.start) - 4);
                    return (
                      <button
                        key={event.key}
                        type="button"
                        className={`ag-ev ${event.kind}${event.key === selectedKey ? " selected" : ""}`}
                        style={{ top: y(event.start) + 2, height: blockHeight }}
                        onClick={event.onPress}
                        aria-label={`${event.label}: ${event.title}, ${minutesToLabel(event.start)}–${minutesToLabel(event.end)}`}
                      >
                        <b>{event.title}</b>
                        {blockHeight >= 40 ? (
                          <span>
                            {minutesToLabel(event.start)}–{minutesToLabel(event.end)}
                            {blockHeight > 60 && event.detail ? ` · ${event.detail}` : ""}
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
              </div>
            );
          })}
          {showsToday && nowMinutes >= fromHour * 60 && nowMinutes <= toHour * 60 ? (
            <div
              className="ag-now"
              style={{
                top: y(nowMinutes),
                left: `calc(52px + (100% - 52px) * ${dateStrs.indexOf(todayStr)} / ${days.length})`,
                width: `calc((100% - 52px) / ${days.length})`,
              }}
              aria-hidden
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
