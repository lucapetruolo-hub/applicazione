"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import {
  BOARD_MAP_TIMINGS,
  BOARD_REPLY_RADIUS_KM,
  OUT_OF_SERVICE_LABELS,
  PROFESSIONAL_CATEGORIES,
  REQUEST_TIMING_LABEL,
  WAITING_TRADE_KEYS,
  boardPlacePoint,
  type BoardMapBounds,
  type BoardMapResult,
} from "@professionisti/shared";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/lib/AuthContext";
import { BoardCards } from "./BoardCards";
import { pointKey, type BoardMapView } from "./BoardMap";
import styles from "./BoardPage.module.css";

const BoardMap = dynamic(() => import("./BoardMap").then((mod) => mod.BoardMap), {
  ssr: false,
  loading: () => <div className={styles.mapBox} />,
});

const FILTERS_KEY = "lavori-cercati-filtri";
const ITALY: BoardMapView = { center: [42.3, 12.6], zoom: 5 };

const TRADES = [
  ...PROFESSIONAL_CATEGORIES.map((category) => ({ slug: category.slug, label: category.label })),
  ...WAITING_TRADE_KEYS.map((key) => ({ slug: key, label: OUT_OF_SERVICE_LABELS[key] })),
].sort((a, b) => a.label.localeCompare(b.label, "it"));

type Filters = { trade: string; timing: string };

/** Bordi stimati di una vista, finché la mappa non dice quelli veri (o senza mappa). */
function approxBounds(view: BoardMapView): BoardMapBounds | null {
  if (view.zoom <= 6) return null;
  const halfLat = 180 / 2 ** view.zoom;
  const halfLon = halfLat * 1.4;
  return { north: view.center[0] + halfLat, south: view.center[0] - halfLat, east: view.center[1] + halfLon, west: view.center[1] - halfLon };
}

function sameBounds(a: BoardMapBounds | null, b: BoardMapBounds | null): boolean {
  if (!a || !b) return a === b;
  const close = (x: number, y: number) => Math.abs(x - y) < 0.02;
  return close(a.north, b.north) && close(a.south, b.south) && close(a.east, b.east) && close(a.west, b.west);
}

function readFilters(): Filters {
  try {
    const saved = JSON.parse(window.localStorage.getItem(FILTERS_KEY) ?? "null") as Partial<Filters> | null;
    return {
      trade: TRADES.some((t) => t.slug === saved?.trade) ? saved!.trade! : "",
      timing: (BOARD_MAP_TIMINGS as readonly string[]).includes(saved?.timing ?? "") ? saved!.timing! : "",
    };
  } catch {
    return { trade: "", timing: "" };
  }
}

/**
 * Mappa dei "Lavori cercati" con filtri ed elenco (analisi/bacheca-mappa-piano.md,
 * "vai" di Luca del 19/11/2026): parte dalla provincia scelta, dalla zona del
 * professionista o da tutta Italia; spostando la mappa compare "Cerca in
 * quest'area"; "Vicino a me" la centra sul telefono senza salvare la
 * posizione. Il professionista vede il cerchio dei 100 km in cui può rispondere.
 * Solo nel browser (`BoardMapLazy`): filtri ricordati e mappa non esistono sul server.
 * Una provincia nuova rimonta il componente (key dalla pagina).
 */
export function BoardMapSection({ province }: { province: string | null }) {
  const { user, token } = useAuth();
  const [filters, setFilters] = useState<Filters>(readFilters);
  const [proZone, setProZone] = useState<[number, number] | null>(null);
  const provinceView = useMemo<BoardMapView | null>(() => {
    const point = province ? boardPlacePoint(`Provincia di ${province}`, province) : null;
    return point ? { center: [point.lat, point.lon], zoom: 9 } : null;
  }, [province]);
  const [view, setView] = useState<{ view: BoardMapView; key: number }>({ view: provinceView ?? ITALY, key: 0 });
  const [searched, setSearched] = useState<BoardMapBounds | null>(() => approxBounds(provinceView ?? ITALY));
  const [visible, setVisible] = useState<{ bounds: BoardMapBounds; view: BoardMapView } | null>(null);
  const [data, setData] = useState<BoardMapResult | null>(null);
  const [error, setError] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [locating, setLocating] = useState<"idle" | "busy" | "denied">("idle");
  const [nowMs, setNowMs] = useState(0);
  // Il primo "idle" di ogni vista nuova sostituisce i bordi stimati con quelli veri, senza pulsante.
  const firstIdle = useRef(true);

  function move(next: BoardMapView) {
    firstIdle.current = true;
    setSelected(null);
    setVisible(null);
    setView((current) => ({ view: next, key: current.key + 1 }));
    setSearched(approxBounds(next));
  }

  // Zona del professionista: cerchio dei 100 km e, senza provincia scelta, la mappa parte da lì.
  useEffect(() => {
    if (!user?.isProfessional || !token) return;
    let cancelled = false;
    apiClient
      .getMyProfessionalProfile(token)
      .then((profile) => {
        if (cancelled || !profile || (profile.latitude === 0 && profile.longitude === 0)) return;
        const zone: [number, number] = [profile.latitude, profile.longitude];
        setProZone(zone);
        if (!province) move({ center: zone, zoom: 8 });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
    // Una volta per accesso: la provincia scelta dopo non deve riportare la mappa sulla zona.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.isProfessional, token]);

  useEffect(() => {
    let cancelled = false;
    apiClient
      .getRequestBoardMap({ trade: filters.trade || null, timing: filters.timing || null, bounds: searched })
      .then((result) => {
        if (cancelled) return;
        setData(result);
        setNowMs(Date.now());
        setError(false);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [filters, searched]);

  function changeFilter(next: Partial<Filters>) {
    const merged = { ...filters, ...next };
    setFilters(merged);
    setSelected(null);
    try {
      window.localStorage.setItem(FILTERS_KEY, JSON.stringify(merged));
    } catch {
      // Senza memoria del browser i filtri valgono solo per questa visita.
    }
  }

  function nearMe() {
    if (!("geolocation" in navigator)) {
      setLocating("denied");
      return;
    }
    setLocating("busy");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating("idle");
        move({ center: [position.coords.latitude, position.coords.longitude], zoom: 10 });
      },
      () => setLocating("denied"),
      { maximumAge: 600_000, timeout: 10_000 },
    );
  }

  const canSearchArea = visible !== null && !sameBounds(visible.bounds, searched);
  const points = data?.points ?? [];
  const shownCards = (data?.cards ?? []).filter((card) => !selected || pointKey(card) === selected);
  const selectedPoint = selected ? points.find((point) => pointKey(point) === selected) : undefined;
  const currentView = visible?.view ?? view.view;

  return (
    <section aria-labelledby="mappa-lavori" className={styles.mapSection}>
      <h2 id="mappa-lavori" className={styles.boxTitle}>
        Sulla mappa
      </h2>
      <div className={styles.mapFilters}>
        <label className={styles.mapFilter}>
          <span>Mestiere</span>
          <select className={styles.zoneSelect} value={filters.trade} onChange={(event) => changeFilter({ trade: event.target.value })}>
            <option value="">Tutti i mestieri</option>
            {TRADES.map((trade) => (
              <option key={trade.slug} value={trade.slug}>
                {trade.label}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.mapFilter}>
          <span>Quando</span>
          <select className={styles.zoneSelect} value={filters.timing} onChange={(event) => changeFilter({ timing: event.target.value })}>
            <option value="">Sempre</option>
            {BOARD_MAP_TIMINGS.map((timing) => (
              <option key={timing} value={timing}>
                {REQUEST_TIMING_LABEL[timing]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className={styles.mapWrap}>
        <BoardMap
          key={view.key}
          view={view.view}
          points={points}
          selected={selected}
          proZone={proZone}
          onSelect={setSelected}
          onIdle={(bounds, current) => {
            setVisible({ bounds, view: current });
            if (firstIdle.current) {
              firstIdle.current = false;
              setSearched(current.zoom <= 6 ? null : bounds);
            }
          }}
        />
        <div className={styles.mapActions}>
          {canSearchArea ? (
            <button type="button" className={styles.mapSearch} onClick={() => setSearched(visible.view.zoom <= 6 ? null : visible.bounds)}>
              Cerca in quest&apos;area
            </button>
          ) : null}
          <button type="button" className={styles.mapNear} onClick={nearMe} disabled={locating === "busy"}>
            {locating === "busy" ? "Cerco…" : "Vicino a me"}
          </button>
        </div>
      </div>
      {locating === "denied" ? <p className={styles.boxText}>Posizione non disponibile: scegli la provincia o sposta la mappa.</p> : null}
      {proZone ? <p className={styles.mapLegend}>Il cerchio è la tua zona: puoi rispondere alle richieste entro {BOARD_REPLY_RADIUS_KM} km.</p> : null}

      <div aria-live="polite">
        {error ? (
          <p className={styles.boxText}>Non riusciamo a caricare le richieste. Riprova tra poco.</p>
        ) : !data ? null : data.total === 0 ? (
          <div className={styles.mapEmpty}>
            <p className={styles.boxText}>Nessuna richiesta in quest&apos;area.</p>
            {currentView.zoom > 5 ? (
              <button type="button" className={styles.mapNear} onClick={() => move({ center: currentView.center, zoom: Math.max(5, currentView.zoom - 2) })}>
                Allarga la mappa
              </button>
            ) : null}
          </div>
        ) : (
          <>
            <p className={styles.mapCount}>
              {selectedPoint ? (
                <>
                  Richieste a {selectedPoint.place.replace("Provincia di ", "provincia di ")} ·{" "}
                  <button type="button" className={styles.linkButton} onClick={() => setSelected(null)}>
                    Mostra tutte
                  </button>
                </>
              ) : (
                `${data.total} ${data.total === 1 ? "richiesta" : "richieste"} in quest'area${data.total > data.cards.length ? `, qui le prime ${data.cards.length}` : ""}`
              )}
            </p>
            <BoardCards cards={shownCards} now={nowMs} />
          </>
        )}
      </div>
    </section>
  );
}
