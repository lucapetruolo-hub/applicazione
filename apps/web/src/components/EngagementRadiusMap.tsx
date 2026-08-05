"use client";

// Unico file che tocca Leaflet per il raggio di ingaggio del professionista
// — CLAUDE.md §2: Leaflet è una scelta "per ora", con piano di migrare a
// Google Maps più avanti. Tutta la logica specifica di Leaflet (marker,
// Circle, fit dei bounds) resta isolata qui dentro: la futura migrazione
// richiederà di riscrivere solo questo file, non di cercare codice mappa
// sparso tra i chiamanti. `EngagementRadiusSection` (il componente che usa
// questo) non importa mai `leaflet`/`react-leaflet` direttamente — vede
// solo l'interfaccia props qui sotto, stabile indipendentemente dal
// provider di mappe usato internamente.
import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Circle, MapContainer, Marker, TileLayer, useMap } from "react-leaflet";
import { brand } from "@professionisti/ui";

export type EngagementRadiusMapProps = {
  /** Posizione fissa del professionista (marker), mai spostabile da qui. */
  latitude: number;
  longitude: number;
  /** Raggio richieste standard, in km (1-25). */
  engagementRadiusKm: number;
  /** Raggio richieste urgenti, in km (1-25), indipendente dal precedente. */
  urgentEngagementRadiusKm: number;
};

const markerIcon = L.icon({
  iconUrl: "/leaflet/marker-icon.png",
  iconRetinaUrl: "/leaflet/marker-icon-2x.png",
  shadowUrl: "/leaflet/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

// Raggio massimo consentito (STEP 2, validato anche lato backend): usato
// per inquadrare la mappa una sola volta al montaggio in modo che il
// cerchio più grande possibile resti sempre visibile, senza dover
// ricalcolare lo zoom ad ogni trascinamento dello slider (che sarebbe
// instabile/fastidioso mentre si trascina).
const MAX_RADIUS_KM = 25;

function FitToMaxRadius({ latitude, longitude }: { latitude: number; longitude: number }) {
  const map = useMap();
  const hasFitted = useRef(false);
  useEffect(() => {
    if (hasFitted.current) return;
    hasFitted.current = true;
    const bounds = L.latLng(latitude, longitude).toBounds(MAX_RADIUS_KM * 1000 * 2);
    map.fitBounds(bounds, { padding: [24, 24] });
  }, [map, latitude, longitude]);
  return null;
}

/**
 * Marker fisso sulla posizione del professionista + due cerchi
 * sovrapposti per i raggi di ingaggio (standard/urgente). Componente
 * puramente di visualizzazione: nessuno stato di form, nessuna chiamata
 * API — riceve i raggi correnti come props e li disegna, controllato
 * interamente dal chiamante (vedi EngagementRadiusSection).
 */
export function EngagementRadiusMap({ latitude, longitude, engagementRadiusKm, urgentEngagementRadiusKm }: EngagementRadiusMapProps) {
  const center: [number, number] = [latitude, longitude];
  return (
    <MapContainer center={center} zoom={12} style={{ height: 360, width: "100%", borderRadius: 4 }} scrollWheelZoom={false}>
      <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      <FitToMaxRadius latitude={latitude} longitude={longitude} />
      <Marker position={center} icon={markerIcon} />
      {/* Circle di Leaflet accetta il raggio in metri: conversione km→m qui, unico punto che lo fa. */}
      <Circle
        center={center}
        radius={engagementRadiusKm * 1000}
        pathOptions={{ color: brand.verificato, fillColor: brand.verificato, fillOpacity: 0.12, weight: 2 }}
      />
      <Circle
        center={center}
        radius={urgentEngagementRadiusKm * 1000}
        pathOptions={{ color: brand.ottone, fillColor: brand.ottone, fillOpacity: 0.08, weight: 2, dashArray: "6 4" }}
      />
    </MapContainer>
  );
}
