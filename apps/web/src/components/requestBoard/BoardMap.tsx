"use client";

import { AdvancedMarker, Circle, Map as GoogleMap } from "@vis.gl/react-google-maps";
import { BOARD_REPLY_RADIUS_KM, type BoardMapBounds, type BoardMapPoint } from "@professionisti/shared";
import { brand } from "@professionisti/ui";
import { GOOGLE_MAPS_MAP_ID, GoogleMapGate } from "@/components/GoogleMapGate";
import styles from "./BoardPage.module.css";

export type BoardMapView = { center: [number, number]; zoom: number };

type Props = {
  view: BoardMapView;
  points: BoardMapPoint[];
  selected: string | null;
  /** Zona del professionista che ha fatto l'accesso: cerchio dei 100 km. */
  proZone: [number, number] | null;
  onIdle: (bounds: BoardMapBounds, view: BoardMapView) => void;
  onSelect: (key: string | null) => void;
};

export function pointKey(point: { province: string; place: string }): string {
  return `${point.province}|${point.place}`;
}

/**
 * Mappa dei "Lavori cercati" (analisi/bacheca-mappa-piano.md): un cerchio con
 * il numero per ogni luogo anonimo (centro del comune, capoluogo per i comuni
 * piccoli), verde scuro se c'è una richiesta di oggi o di ieri. Senza
 * consenso ai servizi Google, l'immagine fissa con gli stessi punti.
 */
export function BoardMap({ view, points, selected, proZone, onIdle, onSelect }: Props) {
  const center = { lat: view.center[0], lng: view.center[1] };
  return (
    <div className={styles.mapBox}>
      <GoogleMapGate
        staticMap={{ markers: points.slice(0, 40).map((point) => [point.lat, point.lon]), center: view.center, zoom: view.zoom }}
        staticAlt="Mappa con i comuni dove ci sono lavori cercati"
      >
        <GoogleMap
          mapId={GOOGLE_MAPS_MAP_ID}
          defaultCenter={center}
          defaultZoom={view.zoom}
          style={{ width: "100%", height: "100%" }}
          gestureHandling="cooperative"
          mapTypeControl={false}
          streetViewControl={false}
          fullscreenControl={false}
          clickableIcons={false}
          onClick={() => onSelect(null)}
          onIdle={(event) => {
            const b = event.map.getBounds();
            const c = event.map.getCenter();
            if (!b || !c) return;
            const ne = b.getNorthEast();
            const sw = b.getSouthWest();
            onIdle({ north: ne.lat(), south: sw.lat(), east: ne.lng(), west: sw.lng() }, { center: [c.lat(), c.lng()], zoom: event.map.getZoom() ?? view.zoom });
          }}
        >
          {proZone ? (
            // Raggio di google.maps.Circle in metri.
            <Circle
              center={{ lat: proZone[0], lng: proZone[1] }}
              radius={BOARD_REPLY_RADIUS_KM * 1000}
              strokeColor={brand.verificato}
              strokeWeight={2}
              fillColor={brand.verificato}
              fillOpacity={0.06}
              clickable={false}
            />
          ) : null}
          {points.map((point) => {
            const key = pointKey(point);
            const isSelected = key === selected;
            return (
              <AdvancedMarker
                key={key}
                position={{ lat: point.lat, lng: point.lon }}
                title={`${point.place}: ${point.count} ${point.count === 1 ? "richiesta" : "richieste"}`}
                zIndex={isSelected ? 1000 : point.fresh ? 10 : undefined}
                onClick={() => onSelect(isSelected ? null : key)}
              >
                <span className={`${styles.pin}${point.fresh ? ` ${styles.pinFresh}` : ""}${isSelected ? ` ${styles.pinSelected}` : ""}`}>{point.count}</span>
              </AdvancedMarker>
            );
          })}
        </GoogleMap>
      </GoogleMapGate>
    </div>
  );
}
