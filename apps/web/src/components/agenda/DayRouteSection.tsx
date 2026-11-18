"use client";

import { useEffect, useRef, useState } from "react";
import { Car, ChevronDown, ChevronLeft, ChevronRight, ListChecks, Sparkles, TriangleAlert } from "lucide-react";
import { dayRouteMapsUrl, formatAppointmentDate, formatAppointmentTimeRange, type DayRoute, type DayRouteStop } from "@professionisti/shared";
import { apiClient } from "@/lib/apiClient";
import { addDaysUtc, isSameDateUtc, toIsoDate } from "@/lib/calendarDates";

function travelLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

const SKIP_STORAGE_KEY = "giro-tappe-tolte";

/** Tappe tolte salvate su questo dispositivo, solo da oggi in poi (i giorni passati si dimenticano). */
function readSavedSkips(todayStr: string): Record<string, string[]> {
  if (typeof window === "undefined") return {};
  try {
    const saved: unknown = JSON.parse(window.localStorage.getItem(SKIP_STORAGE_KEY) ?? "{}");
    if (!saved || typeof saved !== "object") return {};
    const result: Record<string, string[]> = {};
    for (const [date, keys] of Object.entries(saved as Record<string, unknown>)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < todayStr || !Array.isArray(keys)) continue;
      const valid = keys.filter((key): key is string => typeof key === "string" && /^(booking|external)-[A-Za-z0-9_-]{1,64}$/.test(key));
      if (valid.length > 0) result[date] = valid.slice(0, 60);
    }
    return result;
  } catch {
    return {};
  }
}

/** Mattina, pomeriggio o sera dall'ora d'inizio della fascia (ora di parete in UTC). */
function dayPartLabel(startIso: string): string {
  const hour = Number(startIso.slice(11, 13));
  return hour < 13 ? "Mattina" : hour < 18 ? "Pomeriggio" : "Sera";
}

type StopGroup = { key: string; label: string; range: string; stops: DayRouteStop[] };

/**
 * Tappe del giorno divise per fascia (stesso inizio e stessa fine), in ordine
 * di orario e, dentro la fascia, di ora di arrivo: sono le caselle con cui il
 * professionista sceglie chi mettere nel giro.
 */
export function groupStopsByBand(stops: DayRouteStop[]): StopGroup[] {
  const sorted = [...stops].sort(
    (a, b) => a.start.localeCompare(b.start) || (a.end ?? "").localeCompare(b.end ?? "") || (a.arrivalTime ?? "").localeCompare(b.arrivalTime ?? "") || a.title.localeCompare(b.title, "it"),
  );
  const groups: StopGroup[] = [];
  for (const stop of sorted) {
    const key = `${stop.start}|${stop.end ?? ""}`;
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.stops.push(stop);
    else groups.push({ key, label: dayPartLabel(stop.start), range: formatAppointmentTimeRange(stop.start, stop.end), stops: [stop] });
  }
  return groups;
}

/** Casella della fascia intera: piena, vuota o "a metà" quando solo alcune tappe sono nel giro. */
function BandCheckbox({ checked, mixed, label, onChange }: { checked: boolean; mixed: boolean; label: string; onChange: () => void }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = mixed;
  }, [mixed]);
  return <input ref={ref} type="checkbox" checked={checked} aria-checked={mixed ? "mixed" : checked} aria-label={label} onChange={onChange} />;
}

/**
 * "Giro intelligente" (docs/CHANGELOG.md §288, richiesta dell'utente): le
 * tappe a domicilio di un giorno nell'ordine degli orari, il tempo di strada
 * tra l'una e l'altra, un avviso quando non basta e il giro intero in
 * Google Maps. La mappa è l'immagine fissa del nostro server: nessuno script
 * Google nel browser, quindi nessun consenso.
 */
export function DayRouteSection({ token, today, onOpenStop }: { token: string; today: Date; onOpenStop: (key: string) => void }) {
  const [date, setDate] = useState(today);
  const dateStr = toIsoDate(date);
  // Risposta insieme al giorno a cui si riferisce: cambiando giorno si torna
  // al caricamento finché non arriva quella nuova.
  // Tappe tolte dal giro, per giorno (docs/changelog/2026-11-18-orari-oggi-e-giro.md,
  // richiesta di Luca): restano anche chiudendo la pagina, su questo telefono o computer.
  const [skipByDate, setSkipByDate] = useState<Record<string, string[]>>(() => readSavedSkips(toIsoDate(today)));
  useEffect(() => {
    try {
      window.localStorage.setItem(SKIP_STORAGE_KEY, JSON.stringify(skipByDate));
    } catch {
      // Memoria del browser non disponibile (navigazione privata): la scelta vale finché la pagina è aperta.
    }
  }, [skipByDate]);
  const skip = skipByDate[dateStr] ?? [];
  const skipKey = skip.join(",");
  const [pickerOpen, setPickerOpen] = useState(false);
  // Risposta insieme al giorno e alle tappe tolte a cui si riferisce.
  const [answer, setAnswer] = useState<{ dateStr: string; skipKey: string; route: DayRoute | null; error: string | null } | null>(null);
  // Cambiando solo le tappe resta il giro di prima, un po' sbiadito, finché arriva il nuovo:
  // niente riquadro vuoto a ogni casella.
  const sameDay = answer?.dateStr === dateStr ? answer : null;
  const updating = sameDay !== null && sameDay.skipKey !== skipKey;
  const route = sameDay?.route ?? null;
  const error = sameDay && !updating ? sameDay.error : null;
  const [mapFailedFor, setMapFailedFor] = useState<string | null>(null);
  const mapFailed = mapFailedFor === dateStr;

  useEffect(() => {
    let cancelled = false;
    const keys = skipKey ? skipKey.split(",") : [];
    // Più caselle di fila: si chiede il giro una volta sola, a scelta finita.
    const timer = setTimeout(
      () => {
        apiClient
          .agendaDayRoute(token, dateStr, keys)
          .then((result) => !cancelled && setAnswer({ dateStr, skipKey, route: result, error: null }))
          .catch((err) => !cancelled && setAnswer({ dateStr, skipKey, route: null, error: err instanceof Error ? err.message : "Giro non disponibile, riprova." }));
      },
      keys.length > 0 ? 350 : 0,
    );
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [token, dateStr, skipKey]);

  const skipped = new Set(skip);
  const allStops = route ? [...route.stops, ...(route.skipped ?? [])] : [];
  const groups = groupStopsByBand(allStops);
  const chosenCount = allStops.filter((stop) => !skipped.has(stop.key)).length;
  function setSkip(next: Set<string>) {
    setSkipByDate((prev) => ({ ...prev, [dateStr]: allStops.map((stop) => stop.key).filter((key) => next.has(key)) }));
  }
  function toggleStop(key: string) {
    const next = new Set(skipped);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setSkip(next);
  }
  function toggleGroup(group: StopGroup) {
    const next = new Set(skipped);
    const allIn = group.stops.every((stop) => !next.has(stop.key));
    for (const stop of group.stops) {
      if (allIn) next.add(stop.key);
      else next.delete(stop.key);
    }
    setSkip(next);
  }

  const tomorrow = addDaysUtc(today, 1);
  const dayName = isSameDateUtc(date, today)
    ? "Oggi"
    : isSameDateUtc(date, tomorrow)
      ? "Domani"
      : formatAppointmentDate(date, { weekday: "long", day: "numeric", month: "long" });
  const mapsUrl = route ? dayRouteMapsUrl(route.stops) : null;
  const tightCount = route?.legs.filter((leg) => leg.tight).length ?? 0;
  const staticMap =
    route && route.stops.length > 0
      ? apiClient.staticMapUrl({ markers: route.stops.map((s) => [s.latitude, s.longitude] as [number, number]), width: 640, height: 300 })
      : null;
  const totalMinutes = route?.legs.reduce((sum, leg) => sum + leg.minutes, 0) ?? 0;
  const totalKm = route?.legs.reduce((sum, leg) => sum + leg.km, 0) ?? 0;
  const anyEstimated = route?.legs.some((leg) => leg.estimated) ?? false;

  return (
    <div className="ag-card" style={{ padding: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <Sparkles size={20} aria-hidden style={{ color: "var(--ag-green-dark)" }} />
        <h2 style={{ fontSize: 19 }}>Giro intelligente</h2>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
          <button type="button" className="ag-icon-btn" style={{ background: "#f6f1ec" }} onClick={() => setDate(addDaysUtc(date, -1))} aria-label="Giorno precedente">
            <ChevronLeft size={18} aria-hidden />
          </button>
          <span style={{ fontWeight: 600, minWidth: 120, textAlign: "center", textTransform: "capitalize" }}>{dayName}</span>
          <button type="button" className="ag-icon-btn" style={{ background: "#f6f1ec" }} onClick={() => setDate(addDaysUtc(date, 1))} aria-label="Giorno successivo">
            <ChevronRight size={18} aria-hidden />
          </button>
        </div>
      </div>
      <p className="ag-muted" style={{ fontSize: 13.5, marginTop: 4 }}>
        Le tappe a domicilio in ordine di orario, con il tempo di strada tra l&apos;una e l&apos;altra.
      </p>

      {allStops.length > 1 ? (
        <div className="ag-rt-pick">
          <button type="button" className="ag-rt-pick-toggle" aria-expanded={pickerOpen} aria-controls="ag-rt-pick-list" onClick={() => setPickerOpen((open) => !open)}>
            <ListChecks size={18} aria-hidden />
            <span className="ag-rt-pick-title">Scegli le tappe</span>
            <span className={`ag-rt-pick-count${chosenCount < allStops.length ? " is-partial" : ""}`} aria-live="polite">
              {chosenCount} di {allStops.length}
            </span>
            <ChevronDown size={18} aria-hidden className="ag-rt-pick-chevron" />
          </button>
          {pickerOpen ? (
            <div id="ag-rt-pick-list" className="ag-rt-pick-body">
              <p className="ag-muted ag-rt-pick-hint">Togli i lavori che non fai tu o che salti: il giro si ricalcola con quelli scelti.</p>
              {groups.map((group) => {
                const inCount = group.stops.filter((stop) => !skipped.has(stop.key)).length;
                const groupTitle = `${group.label} · ${group.range}`;
                return (
                  <fieldset key={group.key} className="ag-rt-band">
                    <legend className="sr-only">{groupTitle}</legend>
                    <label className="ag-rt-band-head">
                      <BandCheckbox
                        checked={inCount === group.stops.length}
                        mixed={inCount > 0 && inCount < group.stops.length}
                        label={`Tutta la fascia ${groupTitle}`}
                        onChange={() => toggleGroup(group)}
                      />
                      <span className="ag-rt-band-name">
                        <b>{group.label}</b> {group.range}
                      </span>
                      <span className="ag-muted ag-rt-band-count">
                        {inCount} di {group.stops.length}
                      </span>
                    </label>
                    <ul className="ag-rt-band-list">
                      {group.stops.map((stop) => (
                        <li key={stop.key}>
                          <label className={`ag-rt-stop${skipped.has(stop.key) ? " is-off" : ""}`}>
                            <input type="checkbox" checked={!skipped.has(stop.key)} onChange={() => toggleStop(stop.key)} />
                            <span className="ag-rt-stop-text">
                              <b>
                                {stop.title}
                                {stop.arrivalTime ? <span className="ag-rt-arrival">Arrivo {stop.arrivalTime}</span> : null}
                              </b>
                              <span className="ag-muted">{stop.address ?? "Indirizzo non indicato"}</span>
                            </span>
                          </label>
                        </li>
                      ))}
                    </ul>
                  </fieldset>
                );
              })}
              {skip.length > 0 ? (
                <button type="button" className="ag-md-all ag-rt-reset" onClick={() => setSkip(new Set())}>
                  Rimetti tutte le tappe
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <div className="ag-banner error" role="alert" style={{ marginTop: 14 }}>
          {error}
        </div>
      ) : route === null ? (
        <div style={{ height: 220, borderRadius: 16, background: "#f6f1ec", marginTop: 14 }} aria-busy="true" aria-label="Carico il giro" />
      ) : route.stops.length === 0 ? (
        <p style={{ marginTop: 18, fontSize: 14.5 }}>{allStops.length > 0 ? "Nessuna tappa scelta: rimetti almeno un lavoro per vedere il giro." : "Nessun lavoro a domicilio in questo giorno."}</p>
      ) : (
        <div className={updating ? "ag-rt-updating" : undefined} aria-busy={updating || undefined}>
          {tightCount > 0 ? (
            <div className="ag-banner error" role="status" style={{ marginTop: 14 }}>
              <TriangleAlert size={18} aria-hidden />
              {tightCount === 1 ? "Tra due lavori non c'è abbastanza tempo per arrivare." : `In ${tightCount} punti del giro non c'è abbastanza tempo per arrivare.`}
            </div>
          ) : null}
          {staticMap && !mapFailed ? (
            // eslint-disable-next-line @next/next/no-img-element -- immagine del nostro server
            <img src={staticMap} alt="Mappa delle tappe del giorno" onError={() => setMapFailedFor(dateStr)} style={{ width: "100%", height: "auto", aspectRatio: "640 / 300", objectFit: "cover", borderRadius: 16, marginTop: 14, background: "#f6f1ec" }} />
          ) : null}
          <ol style={{ listStyle: "none", padding: 0, margin: "14px 0 0" }}>
            {route.stops.map((stop, index) => {
              const leg = index > 0 ? route.legs[index - 1] : null;
              // Due tappe di cui si conosce solo il comune, nello stesso
              // comune: un tempo di strada sarebbe inventato.
              const sameTown = !!leg && leg.km === 0 && stop.approximate && route.stops[index - 1]!.approximate;
              return (
                <li key={stop.key}>
                  {leg ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0 8px 44px", fontSize: 13, color: leg.tight ? "var(--ag-red)" : "var(--ag-muted)" }}>
                      <Car size={15} aria-hidden />
                      <span>
                        {sameTown ? "Nello stesso comune" : `${leg.estimated ? "circa " : ""}${travelLabel(leg.minutes)} · ${leg.km.toLocaleString("it-IT")} km`}
                        {leg.tight ? ` · hai solo ${Math.max(0, leg.gapMinutes)} min` : ""}
                      </span>
                    </div>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => onOpenStop(stop.key)}
                    style={{ display: "flex", gap: 12, alignItems: "center", width: "100%", border: 0, background: "#fbf7f2", borderRadius: 14, padding: "12px 14px", textAlign: "left", cursor: "pointer", font: "inherit", color: "inherit" }}
                  >
                    <span style={{ width: 28, height: 28, borderRadius: "50%", background: "var(--ag-ink)", color: "#fff", display: "grid", placeItems: "center", fontWeight: 600, fontSize: 13, flex: "none" }}>
                      {index + 1}
                    </span>
                    <span style={{ minWidth: 0 }}>
                      {/* Orario e "Arrivo" sulla stessa riga, il nome sotto: da telefono la pillola non va più a capo da sola. */}
                      <span className="ag-rt-when">
                        {formatAppointmentTimeRange(stop.start, stop.end)}
                        {stop.arrivalTime ? <span className="ag-rt-arrival">Arrivo {stop.arrivalTime}</span> : null}
                      </span>
                      <b style={{ display: "block", fontSize: 14.5 }}>{stop.title}</b>
                      <span className="ag-muted" style={{ fontSize: 13 }}>
                        {stop.address ?? "Indirizzo non indicato"}
                        {stop.approximate ? " (posizione del comune)" : ""}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginTop: 16 }}>
            {mapsUrl ? (
              <a className="ag-btn primary" href={mapsUrl} target="_blank" rel="noreferrer">
                Apri il giro in Google Maps
              </a>
            ) : null}
            {route.legs.length > 0 ? (
              <span className="ag-muted" style={{ fontSize: 13 }}>
                {route.stops.length} tappe
                {totalKm > 0 ? ` · ${anyEstimated ? "circa " : ""}${Math.round(totalKm)} km · ${travelLabel(totalMinutes)} di strada` : ""}
              </span>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
