"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet";
import type { ProfessionalSearchResult } from "@professionisti/shared";
import { ProfessionalAvatar } from "@/components/ProfessionalAvatar";

export type MapBounds = { north: number; south: number; east: number; west: number };

const markerIcon = L.icon({
  iconUrl: "/leaflet/marker-icon.png",
  iconRetinaUrl: "/leaflet/marker-icon-2x.png",
  shadowUrl: "/leaflet/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

const ROME_FALLBACK: [number, number] = [41.9028, 12.4964];

function FitBounds({ points, fallbackCenter }: { points: [number, number][]; fallbackCenter?: [number, number] }) {
  const map = useMap();
  // Deve inquadrare SOLO all'apertura: se scattasse ad ogni render andrebbe
  // in conflitto con lo zoom/pan manuale dell'utente, riportando la mappa
  // all'inquadratura iniziale ogni volta che la lista a sinistra si aggiorna
  // (ResultsListWithMap ricrea points/fallbackCenter come nuovi array ad
  // ogni render, quindi senza guardia questo effetto ripartirebbe sempre).
  const hasFitted = useRef(false);
  useEffect(() => {
    if (hasFitted.current) return;
    hasFitted.current = true;
    if (points.length === 0) {
      // Nessun professionista con coordinate: se conosciamo comunque la
      // città cercata (es. "Latina" senza risultati) zooma lì, così la
      // mappa mostra sempre la zona cercata invece di sparire o restare
      // ferma sull'inquadratura di default su tutta Italia.
      if (fallbackCenter) map.setView(fallbackCenter, 12);
      return;
    }
    const [first] = points;
    if (points.length === 1 && first) {
      map.setView(first, 12);
      return;
    }
    map.fitBounds(points, { padding: [32, 32] });
  }, [map, points, fallbackCenter]);
  return null;
}

function BoundsSync({ onBoundsChange }: { onBoundsChange?: (bounds: MapBounds) => void }) {
  const map = useMapEvents({
    moveend: () => {
      const b = map.getBounds();
      onBoundsChange?.({ north: b.getNorth(), south: b.getSouth(), east: b.getEast(), west: b.getWest() });
    },
  });
  // Cattura anche l'inquadratura iniziale (dopo lo zoom di FitBounds, che
  // gira nello stesso tick), così la lista a sinistra parte già allineata
  // a quello che si vede sulla mappa invece di aspettare il primo pan/zoom.
  useEffect(() => {
    const b = map.getBounds();
    onBoundsChange?.({ north: b.getNorth(), south: b.getSouth(), east: b.getEast(), west: b.getWest() });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
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
  const initialPoints: [number, number][] = initialWithCoords.map((p) => [p.latitude, p.longitude]);
  const center = initialPoints[0] ?? fallbackCenter ?? ROME_FALLBACK;
  const initialZoom = initialPoints.length === 0 && fallbackCenter ? 12 : 6;

  return (
    <div className="results-map-container">
      <MapContainer center={center} zoom={initialZoom} style={{ width: "100%", height: "100%" }} scrollWheelZoom={false}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitBounds points={initialPoints} fallbackCenter={fallbackCenter} />
        <BoundsSync onBoundsChange={onBoundsChange} />
        {withCoords.map((pro) => (
          <Marker
            key={pro.id}
            position={[pro.latitude, pro.longitude]}
            icon={markerIcon}
            eventHandlers={{ click: () => setSelected(pro) }}
          />
        ))}
      </MapContainer>

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
              {selected.rating !== null ? ` · ⭐ ${selected.rating.toFixed(1)}` : ""}
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
            ✕
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
          color: #1e5eff;
        }
        .map-banner-subtitle {
          font-size: 13px;
          color: #667085;
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
          background: #f1f5f9;
          cursor: pointer;
          font-size: 14px;
        }
      `}</style>
    </div>
  );
}
