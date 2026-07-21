"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import type { ProfessionalSearchResult } from "@professionisti/shared";

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

function FitBounds({ points }: { points: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) return;
    const [first] = points;
    if (points.length === 1 && first) {
      map.setView(first, 12);
      return;
    }
    map.fitBounds(points, { padding: [32, 32] });
  }, [map, points]);
  return null;
}

export function ResultsMap({ professionals }: { professionals: ProfessionalSearchResult[] }) {
  const router = useRouter();
  // Coordinate 0,0 = professionista senza comune geocodificato ancora: non ha senso metterlo sull'oceano davanti all'Africa.
  const withCoords = professionals.filter((p) => p.latitude !== 0 || p.longitude !== 0);
  const points: [number, number][] = withCoords.map((p) => [p.latitude, p.longitude]);
  const center = points[0] ?? ROME_FALLBACK;

  return (
    <MapContainer center={center} zoom={6} style={{ width: "100%", height: "100%" }} scrollWheelZoom={false}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FitBounds points={points} />
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
