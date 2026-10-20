import { Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import type { AddressPlace, AddressSuggestion } from "@professionisti/shared";

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

const TIMEOUT_MS = 5000;

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

  private apiKey(): string {
    const key = process.env.GOOGLE_MAPS_API_KEY?.trim();
    if (!key) throw new ServiceUnavailableException("Suggerimenti di indirizzo non disponibili.");
    return key;
  }

  private async call<T>(url: string, init: RequestInit): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await fetch(url, { ...init, signal: controller.signal });
      if (!response.ok) {
        this.logger.error(`Google Places ha risposto ${response.status}: ${(await response.text()).slice(0, 300)}`);
        throw new ServiceUnavailableException("Suggerimenti di indirizzo non disponibili.");
      }
      return (await response.json()) as T;
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      this.logger.warn(`Google Places non raggiungibile: ${error instanceof Error ? error.message : error}`);
      throw new ServiceUnavailableException("Suggerimenti di indirizzo non disponibili.");
    } finally {
      clearTimeout(timeout);
    }
  }

  async suggest(input: { q: string; session: string; latitude?: number; longitude?: number }): Promise<AddressSuggestion[]> {
    const text = input.q.trim().slice(0, 200);
    if (text.length < 3) return [];
    const key = this.apiKey();
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

  async place(id: string, session: string): Promise<AddressPlace> {
    const key = this.apiKey();
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
