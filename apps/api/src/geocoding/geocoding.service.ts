import { Injectable, Logger } from "@nestjs/common";

export type GeocodedPoint = { latitude: number; longitude: number };

@Injectable()
export class GeocodingService {
  private readonly logger = new Logger(GeocodingService.name);

  // Nominatim (OpenStreetMap) invece di Google Geocoding: stessa scelta già
  // fatta per le tile della mappa (CLAUDE.md §2) — gratuito, nessuna chiave
  // API, nessuna carta di pagamento. La policy di utilizzo di Nominatim
  // richiede uno User-Agent identificativo e non tollera un volume alto di
  // richieste: qui va bene, geocodifica solo al salvataggio del profilo
  // professionista (poche richieste al giorno), mai in un percorso di ricerca.
  async geocodeAddress(query: string): Promise<GeocodedPoint | null> {
    const trimmed = query.trim();
    if (!trimmed) return null;

    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("q", trimmed);
    url.searchParams.set("format", "json");
    url.searchParams.set("limit", "1");
    url.searchParams.set("countrycodes", "it");

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          // Contatto richiesto dalla usage policy di Nominatim — configurabile
          // via env var (mai un'email personale hardcoded nel sorgente, vedi
          // CLAUDE.md "Verbale di Conformità"): senza NOMINATIM_CONTACT_EMAIL
          // impostata ricade su un placeholder non personale, da valorizzare
          // con un contatto aziendale reale prima del lancio.
          "User-Agent": `Professionisti/1.0 (contact: ${process.env.NOMINATIM_CONTACT_EMAIL ?? "non-configurato@example.invalid"})`,
        },
      });
      if (!response.ok) return null;
      const results = (await response.json()) as { lat: string; lon: string }[];
      const first = results[0];
      if (!first) return null;
      const latitude = Number(first.lat);
      const longitude = Number(first.lon);
      if (Number.isNaN(latitude) || Number.isNaN(longitude)) return null;
      return { latitude, longitude };
    } catch (error) {
      // Non deve mai far fallire il salvataggio del profilo: se la
      // geocodifica dell'indirizzo preciso non riesce (timeout, indirizzo non
      // trovato, servizio non raggiungibile) si ricade sul centro del comune,
      // già calcolato altrove — un professionista non deve restare bloccato
      // per un servizio esterno non essenziale.
      this.logger.warn(`Geocodifica indirizzo fallita per "${trimmed}": ${error instanceof Error ? error.message : error}`);
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }
}
