"use client";

import { formatRating, professionalPath } from "@professionisti/shared";
import { useState, type ReactNode, type TouchEvent } from "react";
import { useRouter } from "next/navigation";
import { AdvancedMarker, Map as GoogleMap } from "@vis.gl/react-google-maps";
import { BadgeCheck, CalendarDays, ChevronLeft, ChevronRight, Star, X } from "lucide-react";
import type { ProfessionalSearchResult } from "@professionisti/shared";
import { BadgeInfo, brand, formatDistanceKm } from "@professionisti/ui";
import { ProfessionalAvatar } from "@/components/ProfessionalAvatar";
import { GOOGLE_MAPS_MAP_ID, GoogleMapGate } from "@/components/GoogleMapGate";

export type MapBounds = { north: number; south: number; east: number; west: number };

const ROME_FALLBACK: [number, number] = [41.9028, 12.4964];

const WEEKDAYS = ["Dom", "Lun", "Mar", "Mer", "Gio", "Ven", "Sab"];
const MONTHS = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];
/** Orari mostrati nell'anteprima, poi "Altro" (come miodottore.it). */
const PREVIEW_SLOTS = 2;

/**
 * Primo giorno con orari liberi nella modalità cercata, per l'anteprima sulla
 * mappa (docs/changelog/2026-11-05-anteprima-mappa.md): "Oggi", "Domani" o
 * il giorno della settimana, come nella scheda della lista.
 */
function nextFreeDay(pro: ProfessionalSearchResult, mode: "HOME" | "ONLINE") {
  const allows = mode === "HOME" ? "allowsHome" : "allowsOnline";
  const free = mode === "HOME" ? "homeAvailable" : "onlineAvailable";
  const start = Date.parse(`${pro.availabilityFrom}T00:00:00Z`);
  const days = [...pro.availabilityPreview].sort((a, b) => a.date.localeCompare(b.date));
  for (const day of days) {
    const slots = day.times.filter((slot) => slot[allows] && slot[free]);
    if (slots.length === 0) continue;
    const date = new Date(`${day.date}T00:00:00Z`);
    const offset = Number.isNaN(start) ? -1 : Math.round((date.getTime() - start) / 86_400_000);
    const when = offset === 0 ? "Oggi" : offset === 1 ? "Domani" : WEEKDAYS[date.getUTCDay()];
    return { date: day.date, label: `${when} ${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}`, slots };
  }
  return null;
}

function toLatLng([lat, lng]: [number, number]): google.maps.LatLngLiteral {
  return { lat, lng };
}

// Sfalsamento puntini sovrapposti (richiesta esplicita dell'utente: "se ci
// sono più professionisti sullo stesso punto — di solito quando inseriscono
// solo la città — sfalsali in modo da poterli cliccare con più facilità").
// Più professionisti nella stessa città senza indirizzo preciso condividono
// letteralmente le stesse coordinate (il centroide del comune, CLAUDE.md
// §13/§2): senza sfalsamento i loro puntini si sovrappongono esattamente,
// solo l'ultimo renderizzato resta cliccabile. Raggruppa per coordinata
// (arrotondata a 5 decimali, ~1m — cattura anche differenze di calcolo in
// virgola mobile, non solo un'uguaglianza esatta) e dispone ogni gruppo di
// 2+ professionisti in un piccolo cerchio (~90m di raggio a queste
// latitudini) attorno al punto originale — sufficiente a separare i puntini
// senza spostarli fuori dal quartiere/comune reale.
const CLUSTER_OFFSET_DEG = 0.0009;

function offsetOverlappingPositions(items: ProfessionalSearchResult[]): Map<string, [number, number]> {
  const groups = new Map<string, ProfessionalSearchResult[]>();
  for (const item of items) {
    const key = `${item.latitude.toFixed(5)},${item.longitude.toFixed(5)}`;
    const group = groups.get(key);
    if (group) group.push(item);
    else groups.set(key, [item]);
  }
  const positions = new Map<string, [number, number]>();
  for (const group of groups.values()) {
    if (group.length === 1) {
      const only = group[0]!;
      positions.set(only.id, [only.latitude, only.longitude]);
      continue;
    }
    group.forEach((item, index) => {
      const angle = (2 * Math.PI * index) / group.length;
      positions.set(item.id, [item.latitude + CLUSTER_OFFSET_DEG * Math.sin(angle), item.longitude + CLUSTER_OFFSET_DEG * Math.cos(angle)]);
    });
  }
  return positions;
}

// Segnaposto vicini raggruppati in uno solo con il numero (collaudo dell'8/11,
// E6-08): a zoom di città due professionisti a 100 m l'uno dall'altro si
// coprivano e se ne vedeva uno solo. Il raggruppamento dipende dallo zoom:
// due segnaposto più vicini di PIN_GROUP_PX pixel finiscono insieme; toccando
// il numero si apre l'anteprima del primo, con le frecce per gli altri.
const PIN_GROUP_PX = 44;
/** Schede nell'elenco scorrevole sotto la mappa da telefono. */
const STRIP_MAX = 30;

type PinGroup = { position: [number, number]; members: ProfessionalSearchResult[] };

export function groupNearbyPins(items: ProfessionalSearchResult[], positions: Map<string, [number, number]>, zoom: number | null): PinGroup[] {
  const groups: PinGroup[] = [];
  // Gradi di longitudine per pixel a questo zoom (proiezione di Google: 256 px per 360° a zoom 0).
  const degPerPx = zoom === null ? 0 : 360 / (256 * 2 ** zoom);
  for (const item of items) {
    const position = positions.get(item.id) ?? [item.latitude, item.longitude];
    const cosLat = Math.cos((position[0] * Math.PI) / 180) || 1;
    const near = degPerPx
      ? groups.find(
          (group) =>
            Math.abs(group.position[1] - position[1]) / degPerPx < PIN_GROUP_PX &&
            Math.abs(group.position[0] - position[0]) / (degPerPx * cosLat) < PIN_GROUP_PX,
        )
      : undefined;
    if (near) near.members.push(item);
    else groups.push({ position, members: [item] });
  }
  return groups;
}

// Mezza ampiezza minima dell'inquadratura attorno al luogo cercato (~5 km):
// con i risultati tutti nel centro del comune la mappa non zooma su un punto.
const MIN_HALF_SPAN_DEG = 0.045;

function boundsAround([lat, lng]: [number, number], points: [number, number][]) {
  const halfLat = Math.max(MIN_HALF_SPAN_DEG, ...points.map(([pLat]) => Math.abs(pLat - lat)));
  const halfLng = Math.max(MIN_HALF_SPAN_DEG, ...points.map(([, pLng]) => Math.abs(pLng - lng)));
  return { north: lat + halfLat, south: lat - halfLat, east: lng + halfLng, west: lng - halfLng, padding: 32 };
}

export function ResultsMap({
  professionals,
  initialProfessionals,
  fallbackCenter,
  onBoundsChange,
  fullScreen = false,
  mode = "HOME",
  slotHref,
  profileHref = (pro) => professionalPath(pro),
  renderSave,
  onSelectedChange,
}: {
  /** Tutti i professionisti da mostrare come puntini sulla mappa. */
  professionals: ProfessionalSearchResult[];
  /** Sottoinsieme (es. filtrato per città cercata) su cui centrare/zoomare all'apertura. Default: `professionals`. */
  initialProfessionals?: ProfessionalSearchResult[];
  /** Centro su cui zoomare quando non ci sono professionisti con coordinate (es. coordinate della città cercata). */
  fallbackCenter?: [number, number];
  /** Notifica i confini visibili della mappa ad ogni pan/zoom, per sincronizzare la lista a sinistra. */
  onBoundsChange?: (bounds: MapBounds) => void;
  /**
   * Mappa a schermo intero da telefono
   * (docs/changelog/2026-11-04-mappa-schermo-intero.md): si sposta con un dito
   * solo, non c'è una pagina da scorrere sotto.
   */
  fullScreen?: boolean;
  /** Modalità cercata: gli orari dell'anteprima sono quelli liberi per questa. */
  mode?: "HOME" | "ONLINE";
  /** Richiesta di preventivo con l'orario toccato nell'anteprima. Senza: niente orari. */
  slotHref?: (pro: ProfessionalSearchResult, date: string, time: string, endTime: string, mode: "HOME" | "ONLINE") => string;
  /** Profilo del professionista, con `date` aperto sull'agenda di quel giorno. */
  profileHref?: (pro: ProfessionalSearchResult, date?: string) => string;
  /** Cuoricino "Salva" sulla foto dell'anteprima, come nelle schede della lista. */
  renderSave?: (pro: ProfessionalSearchResult) => ReactNode;
  /** Professionista dell'anteprima aperta (null quando si chiude): la lista lo segna. */
  onSelectedChange?: (id: string | null) => void;
}) {
  // Fuori da React Compiler: usa `<style jsx>` (docs/CHANGELOG.md §345).
  "use no memo";
  const router = useRouter();
  // Inquadratura attuale: l'anteprima scorre solo tra chi si vede sulla mappa.
  const [viewBounds, setViewBounds] = useState<MapBounds | null>(null);
  // Zoom attuale, per raggruppare i segnaposto vicini (null prima della prima inquadratura).
  const [zoom, setZoom] = useState<number | null>(null);
  // Professionista selezionato cliccando un puntino: mostrato come banner in
  // basso SOPRA la mappa (che resta aperta), invece di navigare subito al
  // profilo — l'utente vede un'anteprima e decide se aprirlo.
  const [selected, setSelectedState] = useState<ProfessionalSearchResult | null>(null);
  const setSelected = (pro: ProfessionalSearchResult | null) => {
    setSelectedState(pro);
    onSelectedChange?.(pro?.id ?? null);
  };

  // Coordinate 0,0 = professionista senza comune geocodificato ancora: non ha senso metterlo sull'oceano davanti all'Africa.
  const withCoords = professionals.filter((p) => p.latitude !== 0 || p.longitude !== 0);
  const initialWithCoords = (initialProfessionals ?? professionals).filter((p) => p.latitude !== 0 || p.longitude !== 0);
  // Un solo sfalsamento condiviso da marker e inquadratura iniziale: la
  // mappa deve zoomare esattamente su dove i puntini vengono davvero
  // disegnati, non sulle coordinate originali sovrapposte.
  const markerPositions = offsetOverlappingPositions(withCoords);
  const initialPoints: [number, number][] = initialWithCoords.map((p) => markerPositions.get(p.id) ?? [p.latitude, p.longitude]);
  // Inquadratura iniziale passata a Google come impostazione della mappa
  // (defaultBounds/defaultCenter), non calcolata da codice dopo il
  // caricamento: le chiamate dirette sull'istanza (getDiv/fitBounds) davano
  // errore con la versione attuale di Google Maps (docs/CHANGELOG.md §136).
  // Si inquadra solo all'apertura, poi zoom e spostamenti restano
  // dell'utente. La mappa viene montata solo quando è visibile
  // (ResultsListWithMap), quindi il contenitore ha già le sue dimensioni.
  // Con un luogo cercato (richiesta esplicita dell'utente) la mappa resta
  // centrata sul luogo e si allarga fino al risultato più lontano, anche
  // quando è l'unico professionista trovato fuori dal raggio di ricerca.
  const initialBounds = fallbackCenter && initialPoints.length > 0
    ? boundsAround(fallbackCenter, initialPoints)
    : initialPoints.length >= 2
      ? {
          north: Math.max(...initialPoints.map(([lat]) => lat)),
          south: Math.min(...initialPoints.map(([lat]) => lat)),
          east: Math.max(...initialPoints.map(([, lng]) => lng)),
          west: Math.min(...initialPoints.map(([, lng]) => lng)),
          padding: 32,
        }
      : undefined;
  const center = initialPoints[0] ?? fallbackCenter ?? ROME_FALLBACK;
  const initialZoom = initialPoints.length === 1 || (initialPoints.length === 0 && fallbackCenter) ? 12 : 6;
  // Stessa inquadratura per l'immagine fissa mostrata senza consenso (§265).
  const staticMarkers = withCoords.map((p) => markerPositions.get(p.id) ?? ([p.latitude, p.longitude] as [number, number]));
  const staticMap =
    fallbackCenter && initialPoints.length > 0
      ? { markers: staticMarkers, center: fallbackCenter }
      : initialPoints.length >= 2
        ? { markers: staticMarkers }
        : { markers: staticMarkers, center, zoom: initialZoom };

  // Professionisti tra cui scorrere l'anteprima (docs/changelog/2026-11-05-anteprima-mappa.md):
  // quelli visibili sulla mappa, nell'ordine della lista.
  const inView = (pro: ProfessionalSearchResult) => {
    if (!viewBounds) return true;
    const [lat, lng] = markerPositions.get(pro.id) ?? [pro.latitude, pro.longitude];
    return lat <= viewBounds.north && lat >= viewBounds.south && lng <= viewBounds.east && lng >= viewBounds.west;
  };
  const carousel = selected ? withCoords.filter((pro) => pro.id === selected.id || inView(pro)) : [];
  // Schede dell'elenco sotto la mappa da telefono: al massimo STRIP_MAX.
  const stripPros = fullScreen ? withCoords.filter(inView).slice(0, STRIP_MAX) : [];
  const selectedIndex = selected ? carousel.findIndex((pro) => pro.id === selected.id) : -1;
  const [direction, setDirection] = useState<"next" | "prev" | null>(null);
  const step = (delta: 1 | -1) => {
    if (carousel.length < 2 || selectedIndex < 0) return;
    setDirection(delta === 1 ? "next" : "prev");
    setSelected(carousel[(selectedIndex + delta + carousel.length) % carousel.length]!);
  };

  return (
    <div className={`results-map-container${fullScreen && !selected && stripPros.length > 0 ? " has-strip" : ""}`}>
      <GoogleMapGate staticMap={staticMap}>
        <GoogleMap
          mapId={GOOGLE_MAPS_MAP_ID}
          {...(initialBounds ? { defaultBounds: initialBounds } : { defaultCenter: toLatLng(center), defaultZoom: initialZoom })}
          style={{ width: "100%", height: "100%" }}
          // Come prima con Leaflet (scrollWheelZoom disattivato): la rotellina
          // scorre la pagina, lo zoom si fa con Ctrl+rotellina o due dita.
          gestureHandling={fullScreen ? "greedy" : "cooperative"}
          mapTypeControl={false}
          streetViewControl={false}
          fullscreenControl={false}
          clickableIcons={false}
          // Notifica i confini visibili dopo ogni pan/zoom (e dopo
          // l'inquadratura iniziale), così la lista a sinistra mostra solo
          // chi è visibile sulla mappa.
          onIdle={(event) => {
            const b = event.map.getBounds();
            if (!b) return;
            const ne = b.getNorthEast();
            const sw = b.getSouthWest();
            const next = { north: ne.lat(), south: sw.lat(), east: ne.lng(), west: sw.lng() };
            setViewBounds(next);
            setZoom(event.map.getZoom() ?? null);
            onBoundsChange?.(next);
          }}
        >
          {/* Segnaposto avanzati con la foto (o l'icona di categoria) del
              professionista: scelti dall'utente dopo il confronto con i
              classici (docs/CHANGELOG.md §140). */}
          {groupNearbyPins(withCoords, markerPositions, zoom).map(({ position, members }) => {
            const first = members[0]!;
            const isSelected = members.some((pro) => pro.id === selected?.id);
            const shown = isSelected ? selected! : first;
            return (
              <AdvancedMarker
                key={first.id}
                position={toLatLng(position)}
                title={members.length > 1 ? `${members.length} professionisti: ${members.map((pro) => pro.businessName).join(", ")}` : first.businessName}
                // Il segnaposto dell'anteprima aperta sta sopra gli altri.
                zIndex={isSelected ? 1000 : undefined}
                onClick={() => {
                  setDirection(null);
                  setSelected(isSelected ? shown : first);
                }}
              >
                <div className={`advanced-pin${isSelected ? " selected" : ""}`}>
                  <ProfessionalAvatar imageUrl={shown.imageUrl} categorySlug={shown.categorySlug} size={36} />
                  {members.length > 1 ? (
                    <span className="advanced-pin-count" aria-hidden="true">
                      {members.length}
                    </span>
                  ) : null}
                </div>
              </AdvancedMarker>
            );
          })}
        </GoogleMap>
      </GoogleMapGate>

      {/* Elenco scorrevole delle schede sotto la mappa da telefono (collaudo
          08/11, migliorie approvate da Luca il 09/11): chi si vede sulla
          mappa, nell'ordine della lista; toccando una scheda si apre la
          sua anteprima, con le frecce per gli altri. */}
      {fullScreen && !selected && stripPros.length > 0 ? (
        <ul className="map-strip" aria-label="Professionisti sulla mappa">
          {stripPros.map((pro) => (
            <li key={pro.id}>
              <button
                type="button"
                className="map-strip-card"
                onClick={() => {
                  setDirection(null);
                  setSelected(pro);
                }}
              >
                <ProfessionalAvatar imageUrl={pro.imageUrl} categorySlug={pro.categorySlug} size={44} />
                <span className="map-strip-text">
                  <span className="map-strip-name">{pro.businessName}</span>
                  <span className="map-strip-sub">
                    {pro.rating !== null && pro.reviewCount > 0 ? (
                      <>
                        <Star size={13} strokeWidth={1.5} color={brand.ottone} fill={brand.ottone} aria-hidden />
                        <span className="sr-only">Valutazione</span> {formatRating(pro.rating)} ({pro.reviewCount}) ·{" "}
                      </>
                    ) : null}
                    {pro.categoryLabel}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {selected ? (
        <MapPreview
          key={selected.id}
          pro={selected}
          mode={mode}
          slotHref={slotHref}
          profileHref={profileHref}
          save={renderSave?.(selected)}
          position={carousel.length > 1 ? { index: selectedIndex, total: carousel.length } : null}
          direction={direction}
          onPrev={() => step(-1)}
          onNext={() => step(1)}
          onClose={() => setSelected(null)}
          onOpen={(href) => router.push(href)}
        />
      ) : null}

      <style jsx>{`
        .results-map-container {
          position: relative;
          width: 100%;
          height: 100%;
        }
        .results-map-container :global(.advanced-pin) {
          position: relative;
          padding: 3px;
          background: #ffffff;
          border: 2px solid #247c7c;
          border-radius: 50%;
          box-shadow: 0 3px 8px rgba(15, 23, 42, 0.25);
          cursor: pointer;
        }
        .results-map-container :global(.advanced-pin)::after {
          content: "";
          position: absolute;
          left: 50%;
          bottom: -8px;
          transform: translateX(-50%);
          border-left: 7px solid transparent;
          border-right: 7px solid transparent;
          border-top: 8px solid #247c7c;
        }
        .results-map-container :global(.advanced-pin-count) {
          position: absolute;
          top: -8px;
          right: -10px;
          min-width: 22px;
          height: 22px;
          padding: 0 5px;
          box-sizing: border-box;
          border-radius: 11px;
          background: ${brand.grafite};
          color: #ffffff;
          border: 2px solid #ffffff;
          font-size: 12px;
          font-weight: 800;
          line-height: 18px;
          text-align: center;
        }
        /* Segnaposto dell'anteprima aperta: più grande e pieno di verde,
           per capire subito a chi si riferisce. */
        .results-map-container :global(.advanced-pin.selected) {
          background: ${brand.cianografiaPieno};
          border-color: ${brand.cianografiaPieno};
          transform: scale(1.2);
          transform-origin: 50% calc(100% + 8px);
          box-shadow: 0 0 0 4px rgba(30, 107, 110, 0.25), 0 4px 12px rgba(15, 23, 42, 0.3);
        }
        .results-map-container :global(.advanced-pin.selected)::after {
          border-top-color: ${brand.cianografiaPieno};
        }
        @media (prefers-reduced-motion: no-preference) {
          .results-map-container :global(.advanced-pin) {
            transition: transform 160ms ease-out;
          }
        }
        /* "Usa la mappa interattiva" dell'immagine fissa sale sopra l'elenco. */
        .results-map-container.has-strip :global(.static-map-button) {
          bottom: calc(env(safe-area-inset-bottom, 0px) + 100px);
        }
        .map-strip {
          position: absolute;
          left: 0;
          right: 0;
          bottom: calc(env(safe-area-inset-bottom, 0px) + 12px);
          z-index: 1000;
          display: flex;
          gap: 10px;
          margin: 0;
          padding: 4px 12px;
          list-style: none;
          overflow-x: auto;
          scroll-snap-type: x mandatory;
          scroll-padding: 0 12px;
          scrollbar-width: none;
          overscroll-behavior-x: contain;
        }
        .map-strip::-webkit-scrollbar {
          display: none;
        }
        .map-strip li {
          flex: 0 0 auto;
          scroll-snap-align: start;
        }
        .map-strip-card {
          display: flex;
          align-items: center;
          gap: 10px;
          width: min(260px, calc(100vw - 72px));
          min-height: 64px;
          padding: 10px 12px;
          box-sizing: border-box;
          background: ${brand.calce};
          border: 1px solid ${brand.filetto};
          border-radius: 20px;
          box-shadow: 0 6px 18px rgba(15, 23, 42, 0.18);
          text-align: left;
          font: inherit;
          color: ${brand.grafite};
          cursor: pointer;
        }
        .map-strip-card:focus-visible {
          outline: 3px solid ${brand.cianografiaPieno};
          outline-offset: 2px;
        }
        .map-strip-text {
          display: flex;
          flex-direction: column;
          gap: 2px;
          min-width: 0;
        }
        .map-strip-name {
          font-weight: 700;
          font-size: 15px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .map-strip-sub {
          display: flex;
          align-items: center;
          gap: 3px;
          font-size: 13px;
          color: ${brand.grafite70};
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
      `}</style>
    </div>
  );
}

/**
 * Anteprima del professionista toccato sulla mappa, sul modello di
 * miodottore.it (richiesta di Luca, docs/changelog/2026-11-05-anteprima-mappa.md):
 * foto, nome con la spunta di verifica, mestieri e città, stelle e
 * recensioni, poi il primo giorno con orari liberi e due orari da toccare
 * (portano alla richiesta di preventivo già compilata) più "Altro"
 * (l'agenda del profilo). Toccando il resto si apre il profilo.
 */
function MapPreview({
  pro,
  mode,
  slotHref,
  profileHref,
  save,
  position,
  direction,
  onPrev,
  onNext,
  onClose,
  onOpen,
}: {
  pro: ProfessionalSearchResult;
  save?: ReactNode;
  /** Posizione tra i professionisti visibili sulla mappa (null se è l'unico). */
  position: { index: number; total: number } | null;
  /** Da che parte arriva l'anteprima (scorrimento), null al tocco sul segnaposto. */
  direction: "next" | "prev" | null;
  onPrev: () => void;
  onNext: () => void;
  mode: "HOME" | "ONLINE";
  slotHref?: (pro: ProfessionalSearchResult, date: string, time: string, endTime: string, mode: "HOME" | "ONLINE") => string;
  profileHref: (pro: ProfessionalSearchResult, date?: string) => string;
  onClose: () => void;
  onOpen: (href: string) => void;
}) {
  // Fuori da React Compiler: usa `<style jsx>` (docs/CHANGELOG.md §345).
  "use no memo";
  const next = slotHref ? nextFreeDay(pro, mode) : null;
  const categories = (pro.categories?.length ? pro.categories.map((category) => category.label) : [pro.categoryLabel]).join(", ");
  const distance = pro.distanceKm !== undefined ? ` · ${formatDistanceKm(pro.distanceKm)}` : "";
  const rating = pro.rating ?? 0;
  const profile = profileHref(pro);
  // Il tocco su un pulsante o su un link non apre anche il profilo.
  const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();
  // Scorrere col dito a sinistra o a destra passa al professionista
  // successivo o precedente, come su Airbnb.
  const [touchStart, setTouchStart] = useState<{ x: number; y: number } | null>(null);
  const onTouchStart = (e: TouchEvent) => {
    const t = e.touches[0];
    if (t) setTouchStart({ x: t.clientX, y: t.clientY });
  };
  const onTouchEnd = (e: TouchEvent) => {
    const t = e.changedTouches[0];
    if (!touchStart || !t || !position) return;
    const dx = t.clientX - touchStart.x;
    const dy = t.clientY - touchStart.y;
    setTouchStart(null);
    if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    if (dx < 0) onNext();
    else onPrev();
  };

  return (
    // Tutta l'anteprima porta al profilo col dito; da tastiera ci si arriva dal nome (link vero).
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
    <div
      className={`map-preview${direction ? ` from-${direction}` : ""}`}
      onClick={() => onOpen(profile)}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <div className={`map-preview-head${position ? " with-pager" : ""}`}>
        <span className="map-preview-photo">
          <ProfessionalAvatar imageUrl={pro.imageUrl} categorySlug={pro.categorySlug} size={64} shape="portrait" name={pro.businessName} />
          {save ? (
            // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
            <span className="map-preview-save" onClick={stop}>
              {save}
            </span>
          ) : null}
        </span>
        <div className="map-preview-info">
          <div className="map-preview-name-row">
            <a
              href={profile}
              className="map-preview-name"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onOpen(profile);
              }}
            >
              {pro.businessName}
            </a>
            {pro.verified ? (
              // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
              <span className="map-preview-verified" onClick={stop}>
                <BadgeInfo info="verified">
                  <BadgeCheck size={18} strokeWidth={2} color={brand.cianografiaScuro} aria-label="Verificato" />
                </BadgeInfo>
              </span>
            ) : null}
          </div>
          <span className="map-preview-sub">
            {categories} · {pro.city}
            {distance}
          </span>
          {pro.rating !== null && pro.reviewCount > 0 ? (
            <span className="map-preview-rating" aria-label={`Valutazione ${formatRating(rating)} su 5, ${pro.reviewCount} recensioni`}>
              <span className="map-preview-stars" aria-hidden>
                {[1, 2, 3, 4, 5].map((n) => (
                  <Star key={n} size={15} strokeWidth={1.5} color={brand.ottone} fill={rating >= n - 0.25 ? brand.ottone : "none"} />
                ))}
              </span>
              <span aria-hidden>
                <strong>{formatRating(rating)}</strong> ({pro.reviewCount} recension{pro.reviewCount === 1 ? "e" : "i"})
              </span>
            </span>
          ) : (
            <span className="map-preview-sub">Nessuna recensione ancora</span>
          )}
        </div>
      </div>

      {slotHref ? (
        next ? (
          <div className="map-preview-agenda">
            <span className="map-preview-when">
              <CalendarDays size={16} strokeWidth={1.75} aria-hidden />
              Primo orario libero: {next.label}
            </span>
            <div className="map-preview-slots">
              {next.slots.slice(0, PREVIEW_SLOTS).map((slot) => (
                <button
                  key={slot.time}
                  type="button"
                  className="map-preview-slot"
                  aria-label={`Chiedi un preventivo per ${next.label} alle ${slot.time}`}
                  onClick={(e) => {
                    stop(e);
                    onOpen(slotHref(pro, next.date, slot.time, slot.endTime, mode));
                  }}
                >
                  {slot.time}
                </button>
              ))}
              <button
                type="button"
                className="map-preview-slot map-preview-more"
                onClick={(e) => {
                  stop(e);
                  onOpen(profileHref(pro, next.date));
                }}
              >
                Altro
                <ChevronRight size={16} strokeWidth={2} aria-hidden />
              </button>
            </div>
          </div>
        ) : (
          <div className="map-preview-agenda">
            <span className="map-preview-when">
              <CalendarDays size={16} strokeWidth={1.75} aria-hidden />
              Nessun orario libero nei prossimi giorni
            </span>
          </div>
        )
      ) : null}

      {position ? (
        <div className="map-preview-pager">
          <button
            type="button"
            className="map-preview-nav"
            aria-label="Professionista precedente"
            onClick={(e) => {
              stop(e);
              onPrev();
            }}
          >
            <ChevronLeft size={18} strokeWidth={2} aria-hidden />
          </button>
          <span className="map-preview-count" aria-live="polite">
            {position.index + 1} di {position.total}
          </span>
          <button
            type="button"
            className="map-preview-nav"
            aria-label="Professionista successivo"
            onClick={(e) => {
              stop(e);
              onNext();
            }}
          >
            <ChevronRight size={18} strokeWidth={2} aria-hidden />
          </button>
        </div>
      ) : null}

      <button
        type="button"
        className="map-preview-close"
        aria-label="Chiudi l'anteprima"
        onClick={(e) => {
          stop(e);
          onClose();
        }}
      >
        <X size={16} strokeWidth={2} />
      </button>

      <style jsx>{`
        .map-preview {
          position: absolute;
          left: 12px;
          right: 12px;
          bottom: calc(env(safe-area-inset-bottom, 0px) + 12px);
          z-index: 1000;
          max-width: 440px;
          margin: 0 auto;
          display: flex;
          flex-direction: column;
          gap: 12px;
          background: ${brand.calce};
          border-radius: 20px;
          box-shadow: 0 8px 28px rgba(15, 23, 42, 0.22);
          padding: 16px;
          cursor: pointer;
        }
        @media (prefers-reduced-motion: no-preference) {
          .map-preview.from-next {
            animation: preview-from-right 180ms ease-out;
          }
          .map-preview.from-prev {
            animation: preview-from-left 180ms ease-out;
          }
        }
        @keyframes preview-from-right {
          from {
            opacity: 0.4;
            transform: translateX(28px);
          }
        }
        @keyframes preview-from-left {
          from {
            opacity: 0.4;
            transform: translateX(-28px);
          }
        }
        .map-preview-head {
          display: flex;
          gap: 14px;
          align-items: flex-start;
        }
        /* Solo la riga del nome lascia spazio alla X (e a "2 di 6"): le righe
           sotto stanno già più in basso dei pulsanti. */
        .map-preview-name-row {
          padding-right: 28px;
        }
        .map-preview-photo {
          position: relative;
          display: inline-flex;
          flex-shrink: 0;
        }
        .map-preview-save {
          position: absolute;
          right: 4px;
          bottom: 4px;
        }
        /* "2 di 6" e le frecce accanto alla X. Da telefono solo il numero:
           si scorre col dito. */
        .map-preview-pager {
          position: absolute;
          top: 10px;
          right: 48px;
          display: flex;
          align-items: center;
          gap: 2px;
          height: 32px;
        }
        .map-preview-count {
          font-size: 13px;
          font-weight: 600;
          color: ${brand.grafite70};
          padding: 0 4px;
          white-space: nowrap;
        }
        .map-preview-nav {
          display: none;
          width: 32px;
          height: 32px;
          border-radius: 50%;
          border: none;
          background: ${brand.gesso};
          color: ${brand.grafite};
          cursor: pointer;
          align-items: center;
          justify-content: center;
        }
        .map-preview-head.with-pager .map-preview-name-row {
          padding-right: 76px;
        }
        @media (hover: hover) and (pointer: fine) {
          .map-preview-nav {
            display: flex;
          }
          .map-preview-head.with-pager .map-preview-name-row {
            padding-right: 140px;
          }
        }
        .map-preview-info {
          flex: 1;
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .map-preview-name-row {
          display: flex;
          align-items: center;
          gap: 6px;
          min-width: 0;
        }
        .map-preview-name {
          font-size: 17px;
          font-weight: 800;
          color: ${brand.grafite};
          text-decoration: none;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .map-preview-name:hover {
          text-decoration: underline;
        }
        .map-preview-verified {
          display: inline-flex;
          flex-shrink: 0;
        }
        .map-preview-sub {
          font-size: 14px;
          color: ${brand.grafite70};
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .map-preview-rating {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 14px;
          color: ${brand.grafite70};
          white-space: nowrap;
        }
        .map-preview-rating strong {
          color: ${brand.grafite};
        }
        .map-preview-stars {
          display: inline-flex;
          gap: 1px;
        }
        .map-preview-agenda {
          display: flex;
          flex-direction: column;
          gap: 10px;
          padding-top: 12px;
          border-top: 1px solid ${brand.filetto};
        }
        .map-preview-when {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 14px;
          font-weight: 600;
          color: ${brand.grafite};
        }
        .map-preview-slots {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }
        .map-preview-slot {
          display: inline-flex;
          align-items: center;
          gap: 2px;
          min-height: 44px;
          padding: 0 18px;
          border-radius: 999px;
          border: none;
          background: ${brand.cianografiaVelo};
          color: ${brand.cianografiaScuro};
          font-size: 16px;
          font-weight: 700;
          cursor: pointer;
        }
        .map-preview-slot:hover {
          background: #cde6e6;
        }
        .map-preview-more {
          padding: 0 12px 0 18px;
        }
        .map-preview-slot:focus-visible,
        .map-preview-nav:focus-visible,
        .map-preview-close:focus-visible,
        .map-preview-name:focus-visible {
          outline: 2px solid ${brand.cianografiaScuro};
          outline-offset: 2px;
        }
        .map-preview-close {
          position: absolute;
          top: 10px;
          right: 10px;
          width: 32px;
          height: 32px;
          border-radius: 50%;
          border: none;
          background: ${brand.gesso};
          color: ${brand.grafite};
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
        }
      `}</style>
    </div>
  );
}
