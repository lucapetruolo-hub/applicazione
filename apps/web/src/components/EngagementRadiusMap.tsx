"use client";

// Unico file che disegna la mappa del raggio di ingaggio del professionista:
// `EngagementRadiusSection` (il componente che usa questo) non importa mai
// la libreria di mappe direttamente — vede solo l'interfaccia props qui
// sotto, stabile indipendentemente dal provider (Leaflet fino a
// docs/CHANGELOG.md §133, ora Google Maps).
import { Circle, Map as GoogleMap, Marker } from "@vis.gl/react-google-maps";
import { brand } from "@professionisti/ui";
import { GoogleMapGate } from "@/components/GoogleMapGate";
import { MAP_PIN_ICON_URL } from "@/components/MapPin";

export type EngagementRadiusMapProps = {
  /** Posizione fissa del professionista (marker), mai spostabile da qui. */
  latitude: number;
  longitude: number;
  /** Raggio richieste standard, in km (1-25). */
  engagementRadiusKm: number;
  /** Raggio richieste urgenti, in km (1-25), indipendente dal precedente. */
  urgentEngagementRadiusKm: number;
};

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
          defaultCenter={center}
          // Zoom 9 ≈ 25 km di raggio (il massimo consentito) visibili in 360 px
          // di altezza: il cerchio più grande resta sempre nell'inquadratura,
          // senza ricalcolare lo zoom da codice (docs/CHANGELOG.md §136).
          defaultZoom={9}
          style={{ width: "100%", height: "100%" }}
          gestureHandling="cooperative"
          mapTypeControl={false}
          streetViewControl={false}
          fullscreenControl={false}
          clickableIcons={false}
        >
          <Marker position={center} icon={MAP_PIN_ICON_URL} clickable={false} />
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
