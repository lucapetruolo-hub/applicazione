"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { MapContainer, Marker, Popup, TileLayer, useMap, useMapEvents } from "react-leaflet";
import type { ProfessionalSearchResult } from "@professionisti/shared";

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
  // Coordinate 0,0 = professionista senza comune geocodificato ancora: non ha senso metterlo sull'oceano davanti all'Africa.
  const withCoords = professionals.filter((p) => p.latitude !== 0 || p.longitude !== 0);
  const initialWithCoords = (initialProfessionals ?? professionals).filter((p) => p.latitude !== 0 || p.longitude !== 0);
  const initialPoints: [number, number][] = initialWithCoords.map((p) => [p.latitude, p.longitude]);
  const center = initialPoints[0] ?? fallbackCenter ?? ROME_FALLBACK;
  const initialZoom = initialPoints.length === 0 && fallbackCenter ? 12 : 6;

  return (
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
          eventHandlers={{ click: () => router.push(`/professionista/${pro.id}`) }}
        >
          <Popup>
            <strong>{pro.businessName}</strong>
            <br />
            {pro.categoryLabel} · {pro.city}
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
