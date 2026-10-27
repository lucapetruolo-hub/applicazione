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

/**
 * Comuni con almeno un professionista entro `radiusKm` dal loro centro
 * (docs/CHANGELOG.md §372), dal più al meno servito. Solo i nomi escono
 * dal server, mai il numero né la posizione dei professionisti.
 */
export function coveredComuni<C extends { name: string; lat: number; lon: number }>(
  comuni: readonly C[],
  professionals: readonly { latitude: number; longitude: number }[],
  radiusKm: number,
): C[] {
  const located = professionals.filter((p) => p.latitude !== 0 || p.longitude !== 0);
  if (located.length === 0) return [];
  // Un grado di latitudine è ~111 km: un primo filtro a rettangolo evita il
  // calcolo della distanza per quasi tutti i ~7900 comuni.
  const latSpan = radiusKm / 111;
  const counted: { comune: C; count: number }[] = [];
  for (const comune of comuni) {
    const lonSpan = radiusKm / (111 * Math.max(Math.cos((comune.lat * Math.PI) / 180), 0.1));
    let count = 0;
    for (const p of located) {
      if (Math.abs(p.latitude - comune.lat) > latSpan || Math.abs(p.longitude - comune.lon) > lonSpan) continue;
      if (calculateDistanceKm(comune.lat, comune.lon, p.latitude, p.longitude) <= radiusKm) count++;
    }
    if (count > 0) counted.push({ comune, count });
  }
  return counted.sort((a, b) => b.count - a.count || a.comune.name.localeCompare(b.comune.name, "it")).map((c) => c.comune);
}
