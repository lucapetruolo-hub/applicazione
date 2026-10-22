"use client";

import { useEffect, useState } from "react";
import { Car, ChevronLeft, ChevronRight, Sparkles, TriangleAlert } from "lucide-react";
import { dayRouteMapsUrl, formatAppointmentDate, formatAppointmentTimeRange, type DayRoute } from "@professionisti/shared";
import { apiClient } from "@/lib/apiClient";
import { addDaysUtc, isSameDateUtc, toIsoDate } from "@/lib/calendarDates";

function travelLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
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
  const [route, setRoute] = useState<DayRoute | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mapFailed, setMapFailed] = useState(false);
  const dateStr = toIsoDate(date);

  useEffect(() => {
    let cancelled = false;
    setRoute(null);
    setError(null);
    setMapFailed(false);
    apiClient
      .agendaDayRoute(token, dateStr)
      .then((result) => !cancelled && setRoute(result))
      .catch((err) => !cancelled && setError(err instanceof Error ? err.message : "Giro non disponibile, riprova."));
    return () => {
      cancelled = true;
    };
  }, [token, dateStr]);

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

      {error ? (
        <div className="ag-banner error" role="alert" style={{ marginTop: 14 }}>
          {error}
        </div>
      ) : route === null ? (
        <div style={{ height: 220, borderRadius: 16, background: "#f6f1ec", marginTop: 14 }} aria-busy="true" aria-label="Carico il giro" />
      ) : route.stops.length === 0 ? (
        <p style={{ marginTop: 18, fontSize: 14.5 }}>Nessun lavoro a domicilio in questo giorno.</p>
      ) : (
        <>
          {tightCount > 0 ? (
            <div className="ag-banner error" role="status" style={{ marginTop: 14 }}>
              <TriangleAlert size={18} aria-hidden />
              {tightCount === 1 ? "Tra due lavori non c'è abbastanza tempo per arrivare." : `In ${tightCount} punti del giro non c'è abbastanza tempo per arrivare.`}
            </div>
          ) : null}
          {staticMap && !mapFailed ? (
            // eslint-disable-next-line @next/next/no-img-element -- immagine del nostro server
            <img src={staticMap} alt="Mappa delle tappe del giorno" onError={() => setMapFailed(true)} style={{ width: "100%", height: "auto", aspectRatio: "640 / 300", objectFit: "cover", borderRadius: 16, marginTop: 14, background: "#f6f1ec" }} />
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
                      <b style={{ display: "block", fontSize: 14.5 }}>
                        {formatAppointmentTimeRange(stop.start, stop.end)} · {stop.title}
                      </b>
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
        </>
      )}
    </div>
  );
}
