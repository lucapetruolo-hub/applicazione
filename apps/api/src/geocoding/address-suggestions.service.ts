import { Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import type { AddressPlace, AddressSuggestion } from "@professionisti/shared";
import { DailyBudget } from "../common/daily-budget";
import { opsAlert } from "../common/ops-alert";
import { normalizePlaceName } from "./geocoding.service";

type GoogleAutocompleteResponse = {
  suggestions?: {
    placePrediction?: {
      placeId: string;
      text?: { text: string };
      structuredFormat?: { mainText?: { text: string }; secondaryText?: { text: string } };
    };
  }[];
};

type GooglePlaceResponse = {
  formattedAddress?: string;
  location?: { latitude: number; longitude: number };
  addressComponents?: { longText: string; shortText: string; types: string[] }[];
};

type GoogleTextSearchResponse = {
  places?: { types?: string[]; addressComponents?: { longText: string; shortText: string; types: string[] }[] }[];
};

const TIMEOUT_MS = 5000;
/** Tetti giornalieri (§293): ben sopra l'uso normale di oggi, sotto una bolletta a sorpresa. */
const SUGGESTIONS_DAILY_LIMIT = 5000;
const PLACES_DAILY_LIMIT = 2000;
const POSTAL_CODE_DAILY_LIMIT = 2000;
/**
 * Dopo un errore di Google, per qualche minuto il sito apre il modulo già con
 * i campi separati (§324): meglio che vederlo cambiare mentre si scrive.
 */
const RECENT_FAILURE_MS = 5 * 60_000;

/**
 * Suggerimenti di indirizzo chiesti a Google dal nostro server (richiesta
 * dell'utente, docs/CHANGELOG.md §264), al posto della libreria Places nel
 * browser: nessuno script né cookie di Google sul sito, quindi niente
 * consenso da chiedere e suggerimenti per tutti. Places API (New) con la
 * chiave server `GOOGLE_MAPS_API_KEY`; il token di sessione arriva dal
 * browser, così Google conta una sola sessione per ricerca + scelta.
 */
@Injectable()
export class AddressSuggestionsService {
  private readonly logger = new Logger(AddressSuggestionsService.name);
  private readonly suggestionsBudget = new DailyBudget(SUGGESTIONS_DAILY_LIMIT, () =>
    this.alert("address-budget", "Tetto giornaliero dei suggerimenti di indirizzo raggiunto: fino a mezzanotte si scrive l'indirizzo a mano."),
  );
  private readonly placesBudget = new DailyBudget(PLACES_DAILY_LIMIT, () =>
    this.alert("address-place-budget", "Tetto giornaliero dei dettagli di indirizzo raggiunto: fino a mezzanotte si scrive l'indirizzo a mano."),
  );

  private readonly postalCodeBudget = new DailyBudget(POSTAL_CODE_DAILY_LIMIT, () =>
    this.alert("postal-code-budget", "Tetto giornaliero dei CAP cercati raggiunto: fino a mezzanotte il CAP si scrive a mano."),
  );

  /** Nel log e, una volta l'ora, su Sentry: il cliente vede solo i campi separati (§324). */
  private alert(key: string, message: string): void {
    this.logger.error(message);
    opsAlert(key, message);
  }

  private lastFailureAt = 0;

  /**
   * I suggerimenti funzionano? Senza chiamare Google: chiave presente, tetto
   * di oggi non raggiunto, nessun errore di Google negli ultimi minuti. Il
   * sito lo chiede prima che si scriva l'indirizzo, così sceglie subito tra
   * campo unico con suggerimenti e campi separati (§324).
   */
  available(now = Date.now()): boolean {
    if (!process.env.GOOGLE_MAPS_API_KEY?.trim()) return false;
    if (!this.suggestionsBudget.hasRoom(new Date(now))) return false;
    return now - this.lastFailureAt > RECENT_FAILURE_MS;
  }

  /** Oltre il tetto il sito mostra il campo di testo semplice, come quando Google non risponde. */
  private takeBudget(budget: DailyBudget): void {
    if (!budget.take()) throw new ServiceUnavailableException("Suggerimenti di indirizzo non disponibili.");
  }

  private apiKey(): string {
    const key = process.env.GOOGLE_MAPS_API_KEY?.trim();
    if (!key) {
      opsAlert("address-no-key", "GOOGLE_MAPS_API_KEY mancante: niente suggerimenti di indirizzo né mappa fissa.");
      throw new ServiceUnavailableException("Suggerimenti di indirizzo non disponibili.");
    }
    return key;
  }

  private async call<T>(url: string, init: RequestInit): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await fetch(url, { ...init, signal: controller.signal });
      if (!response.ok) {
        this.lastFailureAt = Date.now();
        this.alert("address-google-refused", `Google Places ha risposto ${response.status}: ${(await response.text()).slice(0, 300)}`);
        throw new ServiceUnavailableException("Suggerimenti di indirizzo non disponibili.");
      }
      return (await response.json()) as T;
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      this.lastFailureAt = Date.now();
      this.alert("address-google-unreachable", `Google Places non raggiungibile: ${error instanceof Error ? error.message : error}`);
      throw new ServiceUnavailableException("Suggerimenti di indirizzo non disponibili.");
    } finally {
      clearTimeout(timeout);
    }
  }

  async suggest(input: { q: string; session: string; latitude?: number; longitude?: number }): Promise<AddressSuggestion[]> {
    const text = input.q.trim().slice(0, 200);
    if (text.length < 3) return [];
    const key = this.apiKey();
    this.takeBudget(this.suggestionsBudget);
    const hasBias = input.latitude !== undefined && input.longitude !== undefined && Number.isFinite(input.latitude) && Number.isFinite(input.longitude);
    const data = await this.call<GoogleAutocompleteResponse>("https://places.googleapis.com/v1/places:autocomplete", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key },
      body: JSON.stringify({
        input: text,
        sessionToken: input.session,
        includedRegionCodes: ["it"],
        // Solo vie e numeri civici, niente negozi o luoghi di interesse.
        includedPrimaryTypes: ["street_address", "route", "premise", "subpremise"],
        languageCode: "it",
        ...(hasBias ? { locationBias: { circle: { center: { latitude: input.latitude, longitude: input.longitude }, radius: 30_000 } } } : {}),
      }),
    });
    return (data.suggestions ?? []).flatMap((s) => {
      const p = s.placePrediction;
      if (!p) return [];
      return [{ id: p.placeId, main: p.structuredFormat?.mainText?.text ?? p.text?.text ?? "", secondary: p.structuredFormat?.secondaryText?.text ?? "" }];
    });
  }

  /**
   * CAP di via e civico (docs/CHANGELOG.md §352): Google non lo dà per una via
   * senza civico nelle città con più CAP, il modulo di richiesta lo cerca
   * appena si scrive il civico. Places API (New), ricerca testuale: il testo
   * va nel corpo della richiesta, come per i suggerimenti. `null` se non lo
   * trova, se l'indirizzo è di un altro comune o se Google non risponde: il
   * cliente lo scrive a mano.
   */
  async postalCodeFor(input: { street: string; houseNumber: string; city: string }): Promise<string | null> {
    const key = process.env.GOOGLE_MAPS_API_KEY?.trim();
    if (!key || !this.postalCodeBudget.take()) return null;
    const data = await this.call<GoogleTextSearchResponse>("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key, "X-Goog-FieldMask": "places.types,places.addressComponents" },
      body: JSON.stringify({ textQuery: `${input.street} ${input.houseNumber}, ${input.city}`, languageCode: "it", regionCode: "it", pageSize: 1 }),
    }).catch(() => null);
    const place = data?.places?.[0];
    if (!place?.types?.some((t) => t === "street_address" || t === "premise" || t === "subpremise")) return null;
    const component = (type: string) => place.addressComponents?.find((c) => c.types.includes(type))?.longText;
    const comune = component("administrative_area_level_3") ?? component("locality");
    if (!comune || normalizePlaceName(comune) !== normalizePlaceName(input.city)) return null;
    const postalCode = component("postal_code");
    return postalCode && /^\d{5}$/.test(postalCode) ? postalCode : null;
  }

  async place(id: string, session: string): Promise<AddressPlace> {
    const key = this.apiKey();
    this.takeBudget(this.placesBudget);
    const url = new URL(`https://places.googleapis.com/v1/places/${encodeURIComponent(id)}`);
    url.searchParams.set("languageCode", "it");
    if (session) url.searchParams.set("sessionToken", session);
    const data = await this.call<GooglePlaceResponse>(url.toString(), {
      headers: { "X-Goog-Api-Key": key, "X-Goog-FieldMask": "formattedAddress,location,addressComponents" },
    });
    if (!data.location) throw new ServiceUnavailableException("Indirizzo non trovato.");
    return placeFromGoogle(data);
  }
}

/** Pezzi dell'indirizzo dalla risposta di Google. Il comune è "administrative_area_level_3"; "locality" può essere una frazione. */
export function placeFromGoogle(data: GooglePlaceResponse): AddressPlace {
  const component = (type: string) => data.addressComponents?.find((c) => c.types.includes(type));
  return {
    address: (data.formattedAddress ?? "").replace(/, Italia$/, ""),
    latitude: data.location?.latitude ?? 0,
    longitude: data.location?.longitude ?? 0,
    comune: component("administrative_area_level_3")?.longText ?? component("locality")?.longText ?? null,
    locality: component("locality")?.longText ?? null,
    street: component("route")?.longText ?? null,
    houseNumber: component("street_number")?.longText ?? null,
    postalCode: component("postal_code")?.longText ?? null,
    province: component("administrative_area_level_2")?.shortText ?? null,
  };
}
