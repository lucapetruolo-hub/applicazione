"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
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

// Da computer un'ora più bassa per vedere più giornata; sul telefono resta
// più alta per il dito (docs/changelog/2026-10-28-agenda-orari-in-vista.md).
const HOUR_PX_COMPUTER = 44;
const HOUR_PX_PHONE = 52;
const PHONE_QUERY = "(max-width: 640px)";
// Senza orari né lavori si mostra 08-20; prima partiva dalle 7, un'ora sempre vuota.
const DEFAULT_FROM = 8;
const DEFAULT_TO = 20;
// Spazio lasciato sotto la griglia quando riempie lo schermo.
const BOTTOM_GAP_PX = 16;
const MIN_SCROLL_HEIGHT_PX = 320;

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
  onEmptyPress,
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
  /** Tocco su un orario vuoto: data e minuti (alla mezz'ora) per aggiungere un lavoro lì. */
  onEmptyPress?: (date: Date, minutes: number) => void;
}) {
  // La griglia nasce solo nel browser (dopo il caricamento dei lavori): la misura dello schermo è già nota.
  const [phone] = useState(() => typeof window !== "undefined" && window.matchMedia(PHONE_QUERY).matches);
  const HOUR_PX = phone ? HOUR_PX_PHONE : HOUR_PX_COMPUTER;
  const [showEarly, setShowEarly] = useState(false);
  // Settimana sul telefono: sette colonne strette, le scritte si accorciano.
  const narrowWeek = phone && days.length > 1;
  const dateStrs = days.map(toIsoDate);
  const visible = events.filter((e) => dateStrs.includes(e.date));
  const visibleFree = free.filter((f) => dateStrs.includes(f.date));
  const earliest = Math.min(DEFAULT_FROM * 60, ...visible.map((e) => e.start), ...visibleFree.map((f) => f.start));
  const latest = Math.max(DEFAULT_TO * 60, ...visible.map((e) => e.end), ...visibleFree.map((f) => f.end));
  const dataFromHour = Math.floor(earliest / 60);
  const toHour = Math.min(24, Math.ceil(latest / 60));
  const todayStr = toIsoDate(today);
  const showsToday = dateStrs.includes(todayStr);
  // Sul telefono la giornata scorre con la pagina, quindi oggi le ore già
  // passate si raccolgono in una riga: si parte da un'ora prima di adesso.
  const foldHour = phone && days.length === 1 && showsToday && !showEarly ? Math.min(Math.floor(nowMinutes / 60) - 1, toHour - 2) : null;
  const fromHour = foldHour !== null && foldHour > dataFromHour ? foldHour : dataFromHour;
  const earlyEvents = fromHour > dataFromHour ? visible.filter((e) => e.start < fromHour * 60 && e.kind !== "canceled") : [];
  const height = (toHour - fromHour) * HOUR_PX;
  const y = (minutes: number) => ((minutes - fromHour * 60) / 60) * HOUR_PX;
  const columns = `52px repeat(${days.length}, minmax(0, 1fr))`;

  // All'apertura la griglia scorre all'ora attuale (o al primo appuntamento), non a mezzanotte.
  const scrollRef = useRef<HTMLDivElement>(null);
  const firstStart = visible.length > 0 ? Math.min(...visible.map((e) => e.start)) : null;
  const firstFree = visibleFree.length > 0 ? Math.min(...visibleFree.map((f) => f.start)) : null;
  const anchor = showsToday ? nowMinutes : (firstStart ?? firstFree ?? DEFAULT_FROM * 60);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = Math.max(0, y(anchor) - HOUR_PX);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateStrs.join(",")]);

  // Da computer la griglia arriva fino in fondo allo schermo e scorre al suo
  // interno: aprendo l'agenda si vede tutta l'altezza disponibile, senza
  // dover scorrere la pagina. Misurata prima di disegnare: nessuno spostamento.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || phone) return;
    const fit = () => {
      const top = el.getBoundingClientRect().top + window.scrollY;
      el.style.maxHeight = `${Math.max(MIN_SCROLL_HEIGHT_PX, window.innerHeight - top - BOTTOM_GAP_PX)}px`;
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [phone, days.length]);

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
              {weekdayShortLabel(date)}{" "}
              <span className="ag-day-num">{date.getUTCDate()}</span>
              {note || alert ? (
                <span className={`ag-day-note ${note?.tone ?? ""}${narrowWeek ? " narrow" : ""}`}>
                  {narrowWeek && note?.tone === "free" ? note.text.replace(/ libere$/, "").replace(/ /g, "") : note?.text}
                  {narrowWeek && note?.tone === "free" ? <span className="sr-only"> libere</span> : null}
                  {alert ? <WeatherIcon kind={alert} size={13} /> : null}
                </span>
              ) : null}
            </>
          );
          const className = isSameDateUtc(date, today) ? "today" : "";
          return onDayPress && days.length > 1 ? (
            <button key={dateStr} type="button" className={className} onClick={() => onDayPress(date)}>
              {content}
              {/* Il nome comincia col testo visibile, "lun 26" (A3, §310). */}
              <span className="sr-only">, apri il giorno</span>
            </button>
          ) : (
            <div key={dateStr} className={className}>
              {content}
            </div>
          );
        })}
      </div>
      {fromHour > dataFromHour ? (
        <button type="button" className="ag-early" onClick={() => setShowEarly(true)}>
          Prima delle {String(fromHour).padStart(2, "0")}:00
          {earlyEvents.length > 0 ? ` · ${earlyEvents.length} ${earlyEvents.length === 1 ? "lavoro" : "lavori"}` : ""}
          <span aria-hidden> ›</span>
          <span className="sr-only">, mostra le ore prima</span>
        </button>
      ) : null}
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
              // Toccando un orario vuoto si aggiunge un lavoro a quell'ora (docs/changelog/2026-10-28-agenda-orari-in-vista.md).
              // Da tastiera resta il pulsante "Aggiungi lavoro", che fa la stessa cosa.
              // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
              <div
                key={dateStr}
                className={`ag-col${closed ? " closed" : past ? " past" : ""}${onEmptyPress ? " addable" : ""}`}
                style={{ height }}
                onClick={
                  onEmptyPress
                    ? (e) => {
                        if ((e.target as HTMLElement).closest(".ag-ev, .ag-now")) return;
                        const offset = e.clientY - e.currentTarget.getBoundingClientRect().top;
                        const minutes = fromHour * 60 + Math.floor((offset / HOUR_PX) * 2) * 30;
                        onEmptyPress(date, Math.min(Math.max(minutes, fromHour * 60), toHour * 60 - 30));
                      }
                    : undefined
                }
              >
                {Array.from({ length: toHour - fromHour - 1 }, (_, i) => (
                  <div key={i} className="hl" style={{ top: (i + 1) * HOUR_PX }} />
                ))}
                {closed ? <div className="closed-label">Chiuso</div> : null}
                {visibleFree
                  .filter((band) => band.date === dateStr && band.end > fromHour * 60)
                  .map((band) => {
                    const start = Math.max(band.start, fromHour * 60);
                    return (
                      <div key={`${band.start}-${band.end}`} className="ag-free" style={{ top: y(start) + 2, height: Math.max(8, y(band.end) - y(start) - 4) }}>
                        {y(band.end) - y(start) >= 30 ? <span>Libero</span> : null}
                      </div>
                    );
                  })}
                {visible
                  .filter((event) => event.date === dateStr && event.end > fromHour * 60)
                  .map((event) => {
                    const start = Math.max(event.start, fromHour * 60);
                    const blockHeight = Math.max(26, y(event.end) - y(start) - 4);
                    return (
                      <button
                        key={event.key}
                        type="button"
                        className={`ag-ev ${event.kind}${narrowWeek ? " narrow" : ""}${event.key === selectedKey ? " selected" : ""}`}
                        style={{ top: y(start) + 2, height: blockHeight }}
                        onClick={event.onPress}
                      >
                        {narrowWeek ? (
                          // Settimana sul telefono: colonne troppo strette per il nome, si vede l'ora d'inizio.
                          // Il lettore di schermo legge ancora nome e orario completo.
                          <>
                            <span className="sr-only">
                              {event.title}, {minutesToLabel(event.start)}–{minutesToLabel(event.end)}
                            </span>
                            <b aria-hidden="true">{minutesToLabel(event.start)}</b>
                          </>
                        ) : (
                          <>
                            {/* Il nome letto dal lettore di schermo parte dal testo visibile (WCAG 2.5.3, A3 di §309). */}
                            <b>{event.title}</b>
                            {blockHeight >= 40 ? (
                              <span>
                                <span className="sr-only">, </span>
                                {minutesToLabel(event.start)}–{minutesToLabel(event.end)}
                                {blockHeight > 60 && event.detail ? ` · ${event.detail}` : ""}
                              </span>
                            ) : (
                              <span className="sr-only">
                                , {minutesToLabel(event.start)}–{minutesToLabel(event.end)}
                              </span>
                            )}
                          </>
                        )}
                        <span className="sr-only">, {event.label}</span>
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
