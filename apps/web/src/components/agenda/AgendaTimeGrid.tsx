"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { CloudFog, CloudLightning, CloudRain, Repeat, Snowflake, Wind } from "lucide-react";
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
  /** Visita di un lavoro ricorrente: piccola icona nel riquadro (docs/changelog/2026-11-09-lavori-ricorrenti.md). */
  recurring?: boolean;
  /** Stesso lavoro su più giorni: una sola voce nei conteggi. */
  groupKey?: string;
  /** Orario scritto nel riquadro al posto di inizio–fine, per esempio "verso le 10:00 · fascia 08:00–19:00". */
  timeLabel?: string;
  /** Oltre i posti della fascia: bordo rosso (docs/changelog/2026-11-10-appuntamenti-sovrapposti.md). */
  conflict?: boolean;
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

// Prima gli impegni presi, poi quelli in attesa: a parità d'orario il lavoro confermato sta a sinistra.
const KIND_ORDER: Record<AgendaEventKind, number> = { conf: 0, pending: 0, done: 1, ext: 2, wait: 3, canceled: 4 };

/**
 * Impegni nella stessa fascia affiancati come in Google Calendar, invece che
 * uno sopra l'altro (richiesta di Luca, docs/changelog/2026-11-10-appuntamenti-sovrapposti.md).
 * Ogni gruppo di impegni che si toccano divide la colonna in tante corsie
 * quante ne servono; `minDuration` tiene conto dell'altezza minima del riquadro.
 */
export function layoutLanes(events: AgendaGridEvent[], minDuration = 0): Map<string, { lane: number; lanes: number }> {
  const sorted = [...events].sort((a, b) => a.start - b.start || KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || b.end - a.end);
  const result = new Map<string, { lane: number; lanes: number }>();
  let group: { key: string; lane: number }[] = [];
  let laneEnds: number[] = [];
  let groupEnd = -1;
  const close = () => {
    for (const item of group) result.set(item.key, { lane: item.lane, lanes: laneEnds.length });
    group = [];
    laneEnds = [];
  };
  for (const event of sorted) {
    const end = Math.max(event.end, event.start + minDuration);
    if (event.start >= groupEnd) close();
    let lane = laneEnds.findIndex((laneEnd) => laneEnd <= event.start);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(end);
    } else laneEnds[lane] = end;
    group.push({ key: event.key, lane });
    groupEnd = Math.max(groupEnd, end);
  }
  close();
  return result;
}

// Altezza minima di una riga quando i lavori della stessa fascia stanno uno sotto l'altro.
const STACK_MIN_ROW_PX = 34;

/**
 * Lavori con la stessa identica fascia (per esempio tre prenotazioni
 * 08:00-19:00 prese dalle pillole del preventivo) uno sotto l'altro come un
 * elenco, invece che in colonne strette uguali (scelta di Luca,
 * docs/changelog/2026-11-11-fasce-ampie.md). Solo se ogni riga resta alta
 * almeno STACK_MIN_ROW_PX: `fits(evento)` dice quante righe ci stanno.
 */
export function stackSameBand(
  events: AgendaGridEvent[],
  fits: (event: AgendaGridEvent) => number,
): Map<string, { index: number; count: number; leaderKey: string }> {
  const groups = new Map<string, AgendaGridEvent[]>();
  for (const event of events) {
    if (event.kind === "canceled") continue;
    const id = `${event.start}-${event.end}`;
    groups.set(id, [...(groups.get(id) ?? []), event]);
  }
  const result = new Map<string, { index: number; count: number; leaderKey: string }>();
  for (const group of groups.values()) {
    if (group.length < 2 || fits(group[0]!) < group.length) continue;
    const sorted = [...group].sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.title.localeCompare(b.title, "it"));
    sorted.forEach((event, index) => result.set(event.key, { index, count: sorted.length, leaderKey: sorted[0]!.key }));
  }
  return result;
}

/** Orario del riquadro: quello scritto apposta (ora di arrivo) o inizio–fine. */
function eventTime(event: AgendaGridEvent): string {
  return event.timeLabel ?? `${minutesToLabel(event.start)}–${minutesToLabel(event.end)}`;
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
              ) : days.length > 1 ? (
                // Riga vuota della stessa altezza: un giorno senza fasce resta allineato agli altri (richiesta di Luca, docs/changelog/2026-11-09-chiudi-riapri-pulsanti.md).
                <span className={`ag-day-note${narrowWeek ? " narrow" : ""}`} aria-hidden>
                  {"\u00a0"}
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
                {(() => {
                  const dayEvents = visible.filter((event) => event.date === dateStr && event.end > fromHour * 60);
                  // Altezza minima del riquadro (26 px) in minuti, così due impegni brevi vicini non si coprono.
                  const stackOf = stackSameBand(dayEvents, (event) => (y(event.end) - y(Math.max(event.start, fromHour * 60))) / STACK_MIN_ROW_PX);
                  // Una pila di lavori con la stessa fascia occupa una sola corsia, col posto del primo.
                  const lanesOf = layoutLanes(
                    dayEvents.filter((event) => (stackOf.get(event.key)?.index ?? 0) === 0),
                    Math.ceil(((26 + 4) / HOUR_PX) * 60),
                  );
                  return dayEvents.map((event) => {
                    const stack = stackOf.get(event.key) ?? null;
                    const bandStart = Math.max(event.start, fromHour * 60);
                    const bandHeight = Math.max(26, y(event.end) - y(bandStart) - 4);
                    // In pila ogni lavoro ha una riga della fascia, uno sotto l'altro.
                    const rowHeight = stack ? (bandHeight + 4) / stack.count : 0;
                    const top = stack ? y(bandStart) + 2 + stack.index * rowHeight : y(bandStart) + 2;
                    const blockHeight = stack ? rowHeight - 4 : bandHeight;
                    const { lane, lanes } = lanesOf.get(stack?.leaderKey ?? event.key) ?? { lane: 0, lanes: 1 };
                    const side = narrowWeek ? 3 : 5;
                    const gap = narrowWeek ? 1 : 3;
                    // Nella Settimana del telefono due corsie sono troppo strette per l'ora: restano le strisce colorate.
                    const tight = narrowWeek && lanes > 1;
                    return (
                      <button
                        key={event.key}
                        type="button"
                        className={`ag-ev ${event.kind}${narrowWeek ? " narrow" : ""}${tight ? " tight" : ""}${lanes > 1 ? " shared" : ""}${stack ? " stacked" : ""}${event.conflict ? " conflict" : ""}${event.key === selectedKey ? " selected" : ""}`}
                        style={{
                          top,
                          height: blockHeight,
                          ...(lanes > 1
                            ? {
                                left: `calc(${side}px + (100% - ${side * 2}px) * ${lane} / ${lanes})`,
                                width: `calc((100% - ${side * 2}px) / ${lanes} - ${lane < lanes - 1 ? gap : 0}px)`,
                                right: "auto",
                              }
                            : null),
                        }}
                        onClick={event.onPress}
                      >
                        {tight && !(stack && lanes === 1) ? (
                          <span className="sr-only">
                            {event.title}, {eventTime(event)}
                          </span>
                        ) : narrowWeek && stack ? (
                          // In pila tutti hanno la stessa ora: al posto dell'ora l'inizio del nome.
                          <>
                            <span className="sr-only">
                              {event.title}, {eventTime(event)}
                            </span>
                            <b aria-hidden="true">{event.title}</b>
                          </>
                        ) : narrowWeek ? (
                          // Settimana sul telefono: colonne troppo strette per il nome, si vede l'ora d'inizio.
                          // Il lettore di schermo legge ancora nome e orario completo.
                          <>
                            <span className="sr-only">
                              {event.title}, {eventTime(event)}
                            </span>
                            <b aria-hidden="true">
                              {event.recurring ? <Repeat className="ag-ev-repeat" size={10} strokeWidth={2.5} /> : null}
                              {minutesToLabel(event.start)}
                            </b>
                          </>
                        ) : (
                          <>
                            {/* Il nome letto dal lettore di schermo parte dal testo visibile (WCAG 2.5.3, A3 di §309). */}
                            <b>
                              {event.recurring ? <Repeat className="ag-ev-repeat" size={11} strokeWidth={2.5} aria-hidden /> : null}
                              {event.title}
                            </b>
                            {stack ? (
                              // In pila l'orario è uguale per tutti: si legge la città e il lavoro.
                              <span>
                                <span className="sr-only">
                                  , {eventTime(event)}
                                  {blockHeight >= 40 && event.detail && event.detail !== event.label ? ", " : ""}
                                </span>
                                {blockHeight >= 40 && event.detail !== event.label ? event.detail : null}
                              </span>
                            ) : blockHeight >= 40 ? (
                              <span>
                                <span className="sr-only">, </span>
                                {eventTime(event)}
                                {blockHeight > 60 && event.detail ? ` · ${event.detail}` : ""}
                              </span>
                            ) : (
                              <span className="sr-only">
                                , {eventTime(event)}
                              </span>
                            )}
                          </>
                        )}
                        <span className="sr-only">
                          , {event.label}
                          {event.recurring ? ", lavoro ricorrente" : ""}
                          {event.conflict
                            ? ", sovrapposto: più lavori dei posti della fascia"
                            : stack
                              ? `, ${stack.index + 1} di ${stack.count} nella stessa fascia`
                              : lanes > 1
                                ? ", nella stessa fascia di un altro impegno"
                                : ""}
                        </span>
                      </button>
                    );
                  });
                })()}
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
