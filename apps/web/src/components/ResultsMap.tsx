"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AdvancedMarker, Map as GoogleMap, Pin, useMap } from "@vis.gl/react-google-maps";
import { Star, X } from "lucide-react";
import type { ProfessionalSearchResult } from "@professionisti/shared";
import { brand } from "@professionisti/ui";
import { ProfessionalAvatar } from "@/components/ProfessionalAvatar";
import { GOOGLE_MAPS_MAP_ID, GoogleMapGate } from "@/components/GoogleMapGate";

export type MapBounds = { north: number; south: number; east: number; west: number };

const ROME_FALLBACK: [number, number] = [41.9028, 12.4964];

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

function FitBounds({ points, fallbackCenter }: { points: [number, number][]; fallbackCenter?: [number, number] }) {
  const map = useMap();
  // Deve inquadrare SOLO all'apertura: se scattasse ad ogni render andrebbe
  // in conflitto con lo zoom/pan manuale dell'utente, riportando la mappa
  // all'inquadratura iniziale ogni volta che la lista a sinistra si aggiorna
  // (ResultsListWithMap ricrea points/fallbackCenter come nuovi array ad
  // ogni render, quindi senza guardia questo effetto ripartirebbe sempre).
  const hasFitted = useRef(false);
  useEffect(() => {
    if (!map) return;
    const container = map.getDiv();
    function tryFit() {
      if (!map || hasFitted.current) return;
      // Su mobile la mappa può nascere dentro un contenitore nascosto
      // (display:none, dietro al bottone "Mostra mappa"): un'inquadratura
      // calcolata su un contenitore 0×0 sarebbe sbagliata e non verrebbe
      // mai ricalcolata (questo effetto gira una volta sola). Si aspetta che
      // il contenitore abbia davvero delle dimensioni.
      if (container.clientWidth === 0 || container.clientHeight === 0) return;
      hasFitted.current = true;
      if (points.length === 0) {
        // Nessun professionista con coordinate: se conosciamo comunque la
        // città cercata (es. "Latina" senza risultati) zooma lì, così la
        // mappa mostra sempre la zona cercata invece di restare ferma
        // sull'inquadratura di default su tutta Italia.
        if (fallbackCenter) {
          map.setCenter(toLatLng(fallbackCenter));
          map.setZoom(12);
        }
        return;
      }
      const [first] = points;
      if (points.length === 1 && first) {
        map.setCenter(toLatLng(first));
        map.setZoom(12);
        return;
      }
      const bounds = new google.maps.LatLngBounds();
      for (const point of points) bounds.extend(toLatLng(point));
      map.fitBounds(bounds, 32);
    }

    tryFit();
    // Il contenitore passa da display:none a visibile col toggle "Mostra
    // mappa": riprova l'inquadratura appena ha delle dimensioni.
    const observer = new ResizeObserver(tryFit);
    observer.observe(container);
    return () => observer.disconnect();
  }, [map, points, fallbackCenter]);
  return null;
}

export function ResultsMap({
  professionals,
  initialProfessionals,
  fallbackCenter,
  onBoundsChange,
}: {
  /** Tutti i professionisti da mostrare come puntini sulla mappa. */
  professionals: ProfessionalSearchResult[];
  /** Sottoinsieme (es. filtrato per città cercata) su cui centrare/zoomare all'apertura. Default: `professionals`. */
  initialProfessionals?: ProfessionalSearchResult[];
  /** Centro su cui zoomare quando non ci sono professionisti con coordinate (es. coordinate della città cercata). */
  fallbackCenter?: [number, number];
  /** Notifica i confini visibili della mappa ad ogni pan/zoom, per sincronizzare la lista a sinistra. */
  onBoundsChange?: (bounds: MapBounds) => void;
}) {
  const router = useRouter();
  // Professionista selezionato cliccando un puntino: mostrato come banner in
  // basso SOPRA la mappa (che resta aperta), invece di navigare subito al
  // profilo — l'utente vede un'anteprima e decide se aprirlo.
  const [selected, setSelected] = useState<ProfessionalSearchResult | null>(null);

  // Coordinate 0,0 = professionista senza comune geocodificato ancora: non ha senso metterlo sull'oceano davanti all'Africa.
  const withCoords = professionals.filter((p) => p.latitude !== 0 || p.longitude !== 0);
  const initialWithCoords = (initialProfessionals ?? professionals).filter((p) => p.latitude !== 0 || p.longitude !== 0);
  // Un solo sfalsamento condiviso da marker e inquadratura iniziale: la
  // mappa deve zoomare esattamente su dove i puntini vengono davvero
  // disegnati, non sulle coordinate originali sovrapposte.
  const markerPositions = offsetOverlappingPositions(withCoords);
  const initialPoints: [number, number][] = initialWithCoords.map((p) => markerPositions.get(p.id) ?? [p.latitude, p.longitude]);
  const center = initialPoints[0] ?? fallbackCenter ?? ROME_FALLBACK;
  const initialZoom = initialPoints.length === 0 && fallbackCenter ? 12 : 6;

  return (
    <div className="results-map-container">
      <GoogleMapGate>
        <GoogleMap
          mapId={GOOGLE_MAPS_MAP_ID}
          defaultCenter={toLatLng(center)}
          defaultZoom={initialZoom}
          style={{ width: "100%", height: "100%" }}
          // Come prima con Leaflet (scrollWheelZoom disattivato): la rotellina
          // scorre la pagina, lo zoom si fa con Ctrl+rotellina o due dita.
          gestureHandling="cooperative"
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
            onBoundsChange?.({ north: ne.lat(), south: sw.lat(), east: ne.lng(), west: sw.lng() });
          }}
        >
          <FitBounds points={initialPoints} fallbackCenter={fallbackCenter} />
          {withCoords.map((pro) => (
            <AdvancedMarker
              key={pro.id}
              position={toLatLng(markerPositions.get(pro.id) ?? [pro.latitude, pro.longitude])}
              title={pro.businessName}
              onClick={() => setSelected(pro)}
            >
              <Pin background="#189A63" borderColor="#0F6B44" glyphColor="#FFFFFF" />
            </AdvancedMarker>
          ))}
        </GoogleMap>
      </GoogleMapGate>

      {selected ? (
        <div className="map-banner" onClick={() => router.push(`/professionista/${selected.id}`)}>
          <ProfessionalAvatar imageUrl={selected.imageUrl} categorySlug={selected.categorySlug} size={48} />
          <div className="map-banner-info">
            <div className="map-banner-title-row">
              <strong>{selected.businessName}</strong>
              {selected.verified ? <span className="map-banner-verified">Verificato</span> : null}
            </div>
            <span className="map-banner-subtitle">
              {selected.categoryLabel} · {selected.city}
              {selected.rating !== null ? (
                <>
                  {" · "}
                  <Star size={12} strokeWidth={1.5} color={brand.ottone} fill={brand.ottone} style={{ verticalAlign: "-1px" }} />{" "}
                  {selected.rating.toFixed(1)}
                </>
              ) : (
                ""
              )}
            </span>
          </div>
          <button
            type="button"
            className="map-banner-close"
            aria-label="Chiudi"
            onClick={(e) => {
              e.stopPropagation();
              setSelected(null);
            }}
          >
            <X size={16} strokeWidth={1.5} />
          </button>
        </div>
      ) : null}

      <style jsx>{`
        .results-map-container {
          position: relative;
          width: 100%;
          height: 100%;
        }
        .map-banner {
          position: absolute;
          left: 12px;
          right: 12px;
          bottom: 12px;
          z-index: 1000;
          display: flex;
          align-items: center;
          gap: 12px;
          background: white;
          border-radius: 14px;
          box-shadow: 0 6px 20px rgba(15, 23, 42, 0.2);
          padding: 12px 14px;
          cursor: pointer;
        }
        .map-banner-info {
          flex: 1;
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .map-banner-title-row {
          display: flex;
          align-items: center;
          gap: 8px;
          min-width: 0;
        }
        .map-banner-title-row strong {
          font-size: 15px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .map-banner-verified {
          flex-shrink: 0;
          font-size: 11px;
          font-weight: 600;
          color: #3d6b3e;
        }
        .map-banner-subtitle {
          font-size: 13px;
          color: #6e6459;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .map-banner-close {
          flex-shrink: 0;
          width: 30px;
          height: 30px;
          border-radius: 50%;
          border: none;
          background: #dcf3e7;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
        }
      `}</style>
    </div>
  );
}
