import { calculateDistanceKm } from "../common/geo.util";

export type SearchAreaCandidate = { id: string; latitude: number; longitude: number };

// Margine per considerare "alla stessa distanza" più professionisti del
// professionista più vicino: chi indica solo il comune condivide le
// coordinate del suo centro, e compaiono tutti insieme.
const SAME_DISTANCE_TOLERANCE_KM = 0.05;

/**
 * Ricerca per luogo (richiesta esplicita dell'utente): restituisce i
 * professionisti entro `radiusKm` dal centro cercato, con la loro distanza.
 * Se nel raggio non c'è nessuno, la ricerca si allarga fino al più vicino
 * (e a chi è alla sua stessa distanza). Chi non ha coordinate (0,0) è
 * escluso: la sua posizione non è nota.
 */
export function selectSearchArea(
  center: { lat: number; lon: number },
  candidates: SearchAreaCandidate[],
  radiusKm: number,
): Map<string, number> {
  const withDistance = candidates
    .filter((c) => c.latitude !== 0 || c.longitude !== 0)
    .map((c) => ({ id: c.id, distanceKm: calculateDistanceKm(center.lat, center.lon, c.latitude, c.longitude) }));

  const inside = withDistance.filter((c) => c.distanceKm <= radiusKm);
  if (inside.length > 0) return new Map(inside.map((c) => [c.id, c.distanceKm]));
  if (withDistance.length === 0) return new Map();

  const nearest = Math.min(...withDistance.map((c) => c.distanceKm));
  return new Map(
    withDistance.filter((c) => c.distanceKm <= nearest + SAME_DISTANCE_TOLERANCE_KM).map((c) => [c.id, c.distanceKm]),
  );
}
