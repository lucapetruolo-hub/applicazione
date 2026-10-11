import { BadRequestException, Injectable, Logger } from "@nestjs/common";

export type GeocodedPoint = { latitude: number; longitude: number };

/**
 * Esito del controllo di un indirizzo rispetto al comune indicato:
 * `unavailable` (nessuna chiave, Google non risponde) non deve mai bloccare
 * chi sta salvando.
 */
export type AddressCheck = "ok" | "wrong-city" | "not-found" | "unavailable";

type GoogleGeocodeResponse = {
  status: string;
  error_message?: string;
  results: {
    geometry: { location: { lat: number; lng: number } };
    types?: string[];
    address_components?: { long_name: string; short_name: string; types: string[] }[];
  }[];
};

/** Tipi di risultato che indicano una via o un civico, non solo un comune o una zona. */
const STREET_LEVEL_TYPES = ["street_address", "route", "premise", "subpremise"];

function normalizePlaceName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’`]/g, "'")
    .toLowerCase()
    .trim();
}

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
  /**
   * Controllo lato server dell'indirizzo di una richiesta o dell'account
   * (docs/CHANGELOG.md §214, richiesta esplicita dell'utente: niente
   * indirizzi a caso). Il sito obbliga già a sceglierlo dai suggerimenti di
   * Google; qui si verifica che via e civico esistano davvero e siano nel
   * comune indicato, anche per chi chiama l'API direttamente.
   */
  async checkAddressInCity(input: { street: string; houseNumber?: string | null; postalCode?: string | null; city: string }): Promise<AddressCheck> {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey || !input.street.trim() || !input.city.trim()) return "unavailable";
    const query = [`${input.street.trim()} ${input.houseNumber?.trim() ?? ""}`.trim(), `${input.postalCode?.trim() ?? ""} ${input.city.trim()}`.trim()].join(", ");
    const data = await this.fetchGeocode(query, apiKey);
    if (!data) return "unavailable";
    if (data.status === "ZERO_RESULTS") return "not-found";
    if (data.status !== "OK") return "unavailable";
    const result = data.results[0];
    if (!result || !result.types?.some((t) => STREET_LEVEL_TYPES.includes(t))) return "not-found";
    const component = (type: string) => result.address_components?.find((c) => c.types.includes(type))?.long_name;
    const comune = component("administrative_area_level_3") ?? component("locality");
    if (!comune) return "not-found";
    return normalizePlaceName(comune) === normalizePlaceName(input.city) ? "ok" : "wrong-city";
  }

  /** Come `checkAddressInCity`, ma rifiuta il salvataggio con un messaggio chiaro. Google non disponibile → si salva. */
  async assertAddressInCity(input: { street: string; houseNumber?: string | null; postalCode?: string | null; city: string }): Promise<void> {
    const check = await this.checkAddressInCity(input);
    if (check === "wrong-city") {
      throw new BadRequestException(`L'indirizzo non risulta a ${input.city.trim()}: sceglilo dall'elenco dei suggerimenti.`);
    }
    if (check === "not-found") {
      throw new BadRequestException("Indirizzo non trovato: sceglilo dall'elenco dei suggerimenti.");
    }
  }

  private async fetchGeocode(query: string, apiKey: string): Promise<GoogleGeocodeResponse | null> {
    const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
    url.searchParams.set("address", query);
    url.searchParams.set("components", "country:IT");
    url.searchParams.set("language", "it");
    url.searchParams.set("key", apiKey);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) return null;
      const data = (await response.json()) as GoogleGeocodeResponse;
      if (data.status !== "OK" && data.status !== "ZERO_RESULTS") {
        this.logger.error(`Controllo indirizzo Google rifiutato (${data.status}): ${data.error_message ?? "nessun dettaglio"}`);
      }
      return data;
    } catch (error) {
      this.logger.warn(`Controllo indirizzo non riuscito: ${error instanceof Error ? error.message : error}`);
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }

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
