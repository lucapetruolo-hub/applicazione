import { Injectable, Logger } from "@nestjs/common";

export type GeocodedPoint = { latitude: number; longitude: number };

type GoogleGeocodeResponse = {
  status: string;
  error_message?: string;
  results: { geometry: { location: { lat: number; lng: number } } }[];
};

@Injectable()
export class GeocodingService {
  private readonly logger = new Logger(GeocodingService.name);

  // Google Geocoding API (docs/CHANGELOG.md §133, al posto di Nominatim):
  // stessa scelta di provider della mappa, indirizzi e numeri civici
  // trovati meglio. Usata solo al salvataggio del profilo professionista
  // (poche richieste al giorno, dentro la quota gratuita), mai in un
  // percorso di ricerca. Chiave server `GOOGLE_MAPS_API_KEY`, distinta da
  // quella del browser (limitata per sito web): senza chiave non geocodifica
  // e il profilo resta al centro del comune, come per ogni altro errore.
  async geocodeAddress(query: string): Promise<GeocodedPoint | null> {
    const trimmed = query.trim();
    if (!trimmed) return null;
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      this.logger.warn("GOOGLE_MAPS_API_KEY non configurata: indirizzo non geocodificato, uso il centro del comune.");
      return null;
    }

    const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
    url.searchParams.set("address", trimmed);
    url.searchParams.set("components", "country:IT");
    url.searchParams.set("language", "it");
    url.searchParams.set("key", apiKey);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) return null;
      const data = (await response.json()) as GoogleGeocodeResponse;
      if (data.status !== "OK") {
        // ZERO_RESULTS è normale (indirizzo non trovato); gli altri stati
        // (REQUEST_DENIED, OVER_QUERY_LIMIT...) indicano un problema di
        // chiave o quota da sistemare.
        if (data.status !== "ZERO_RESULTS") {
          this.logger.error(`Geocodifica Google rifiutata (${data.status}): ${data.error_message ?? "nessun dettaglio"}`);
        }
        return null;
      }
      const location = data.results[0]?.geometry.location;
      if (!location || Number.isNaN(location.lat) || Number.isNaN(location.lng)) return null;
      return { latitude: location.lat, longitude: location.lng };
    } catch (error) {
      // Non deve mai far fallire il salvataggio del profilo: se la
      // geocodifica dell'indirizzo preciso non riesce (timeout, indirizzo non
      // trovato, servizio non raggiungibile) si ricade sul centro del comune,
      // già calcolato altrove — un professionista non deve restare bloccato
      // per un servizio esterno non essenziale.
      this.logger.warn(`Geocodifica indirizzo fallita: ${error instanceof Error ? error.message : error}`);
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }
}
