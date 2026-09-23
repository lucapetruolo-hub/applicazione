"use client";

// Unico file che disegna la mappa del raggio di ingaggio del professionista:
// `EngagementRadiusSection` (il componente che usa questo) non importa mai
// la libreria di mappe direttamente — vede solo l'interfaccia props qui
// sotto, stabile indipendentemente dal provider (Leaflet fino a
// docs/CHANGELOG.md §133, ora Google Maps).
import { useEffect, useRef } from "react";
import { AdvancedMarker, Circle, Map as GoogleMap, Pin, useMap } from "@vis.gl/react-google-maps";
import { brand } from "@professionisti/ui";
import { GOOGLE_MAPS_MAP_ID, GoogleMapGate } from "@/components/GoogleMapGate";

export type EngagementRadiusMapProps = {
  /** Posizione fissa del professionista (marker), mai spostabile da qui. */
  latitude: number;
  longitude: number;
  /** Raggio richieste standard, in km (1-25). */
  engagementRadiusKm: number;
  /** Raggio richieste urgenti, in km (1-25), indipendente dal precedente. */
  urgentEngagementRadiusKm: number;
};

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
    if (!map || hasFitted.current) return;
    hasFitted.current = true;
    const bounds = new google.maps.Circle({ center: { lat: latitude, lng: longitude }, radius: MAX_RADIUS_KM * 1000 }).getBounds();
    if (bounds) map.fitBounds(bounds, 24);
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
  const center = { lat: latitude, lng: longitude };
  return (
    <div style={{ height: 360, width: "100%", borderRadius: 4, overflow: "hidden" }}>
      <GoogleMapGate>
        <GoogleMap
          mapId={GOOGLE_MAPS_MAP_ID}
          defaultCenter={center}
          defaultZoom={10}
          style={{ width: "100%", height: "100%" }}
          gestureHandling="cooperative"
          mapTypeControl={false}
          streetViewControl={false}
          fullscreenControl={false}
          clickableIcons={false}
        >
          <FitToMaxRadius latitude={latitude} longitude={longitude} />
          <AdvancedMarker position={center}>
            <Pin background="#189A63" borderColor="#0F6B44" glyphColor="#FFFFFF" />
          </AdvancedMarker>
          {/* Il raggio di google.maps.Circle è in metri: conversione km→m qui, unico punto che lo fa. */}
          <Circle
            center={center}
            radius={engagementRadiusKm * 1000}
            strokeColor={brand.verificato}
            strokeWeight={2}
            fillColor={brand.verificato}
            fillOpacity={0.12}
            clickable={false}
          />
          {/* Google Maps non supporta il tratteggio sui cerchi (prima dashArray con Leaflet): il raggio urgente si distingue per colore. */}
          <Circle
            center={center}
            radius={urgentEngagementRadiusKm * 1000}
            strokeColor={brand.ottone}
            strokeWeight={2}
            fillColor={brand.ottone}
            fillOpacity={0.08}
            clickable={false}
          />
        </GoogleMap>
      </GoogleMapGate>
    </div>
  );
}
