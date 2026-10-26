import { calculateDistanceKm } from "../common/geo.util";
import { SEARCH_RADIUS_KM } from "@professionisti/shared";

export type SearchAreaCandidate = { id: string; latitude: number; longitude: number };

// Margine per considerare "alla stessa distanza" più professionisti del
// professionista più vicino: chi indica solo il comune condivide le
// coordinate del suo centro, e compaiono tutti insieme.
const SAME_DISTANCE_TOLERANCE_KM = 0.05;

/**
 * Ricerca per luogo (richiesta esplicita dell'utente): restituisce i
 * professionisti entro `radiusKm` dal centro cercato, con la loro distanza.
 * Se nel raggio non c'è nessuno, la ricerca si allarga fino al più vicino
 * (e a chi è alla sua stessa distanza), ma non oltre `maxFallbackKm`
 * (docs/CHANGELOG.md §349): più lontano non è un'alternativa utile. Chi non
 * ha coordinate (0,0) è escluso: la sua posizione non è nota.
 */
export function selectSearchArea(
  center: { lat: number; lon: number },
  candidates: SearchAreaCandidate[],
  radiusKm: number,
  maxFallbackKm: number = Number.POSITIVE_INFINITY,
): Map<string, number> {
  const withDistance = candidates
    .filter((c) => c.latitude !== 0 || c.longitude !== 0)
    .map((c) => ({ id: c.id, distanceKm: calculateDistanceKm(center.lat, center.lon, c.latitude, c.longitude) }));

  const inside = withDistance.filter((c) => c.distanceKm <= radiusKm);
  if (inside.length > 0) return new Map(inside.map((c) => [c.id, c.distanceKm]));
  if (withDistance.length === 0) return new Map();

  const nearest = Math.min(...withDistance.map((c) => c.distanceKm));
  if (nearest > maxFallbackKm) return new Map();
  return new Map(
    withDistance.filter((c) => c.distanceKm <= nearest + SAME_DISTANCE_TOLERANCE_KM).map((c) => [c.id, c.distanceKm]),
  );
}

/**
 * La ricerca ha trovato qualcuno davvero vicino (docs/CHANGELOG.md §370):
 * almeno un risultato entro il raggio. Il più vicino fuori raggio, mostrato
 * come alternativa, non basta. Senza distanza (città non riconosciuta) vale
 * qualunque risultato.
 */
export function hasNearbyResult(results: { distanceKm?: number }[], radiusKm: number = SEARCH_RADIUS_KM): boolean {
  return results.some((r) => r.distanceKm === undefined || r.distanceKm <= radiusKm);
}
