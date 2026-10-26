import { BadRequestException, Controller, Get, Param, Query } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { findComuneByName } from "@professionisti/shared";
import { AddressSuggestionsService } from "./address-suggestions.service";
import { GeocodingService } from "./geocoding.service";

const SESSION = /^[A-Za-z0-9-]{8,64}$/;
const STREET = /^[\p{L}\p{N}' .,°/-]{2,120}$/u;
const HOUSE_NUMBER = /^[0-9]{1,5}[A-Za-z]?(?:\/[0-9A-Za-z]{1,3})?$/;
const POSTAL_CODE = /^[0-9]{5}$/;

/**
 * Suggerimenti di indirizzo per i moduli del sito (docs/CHANGELOG.md §264).
 * Aperti anche a chi non ha fatto l'accesso (richiesta di preventivo), con un
 * limite per IP: chi scrive un indirizzo fa una richiesta ogni pausa di
 * battitura, non ogni lettera.
 */
@Controller("address")
export class AddressSuggestionsController {
  constructor(
    private readonly addressSuggestionsService: AddressSuggestionsService,
    private readonly geocodingService: GeocodingService,
  ) {}

  /** CAP di via e civico, per compilarlo da solo nel modulo di richiesta (§357). */
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Get("postal-code")
  async postalCode(@Query("street") street?: string, @Query("number") houseNumber?: string, @Query("city") city?: string) {
    // Solo valori dall'aspetto di un indirizzo e un comune dell'elenco ISTAT:
    // finiscono nell'indirizzo chiesto a Google.
    // `?street=a&street=b` arriva come elenco: si accettano solo testi.
    if (typeof street !== "string" || typeof houseNumber !== "string" || typeof city !== "string") return { postalCode: null };
    const comune = findComuneByName(city);
    if (!comune || !STREET.test(street) || !HOUSE_NUMBER.test(houseNumber)) return { postalCode: null };
    return { postalCode: await this.addressSuggestionsService.postalCodeFor({ street, houseNumber, city: comune.name }) };
  }

  /** Il CAP scritto è della città? `matches: null` quando non si sa (§357). */
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Get("postal-code/check")
  async postalCodeCheck(@Query("postalCode") postalCode?: string, @Query("city") city?: string) {
    if (typeof postalCode !== "string" || typeof city !== "string") return { matches: null };
    const comune = findComuneByName(city);
    if (!comune || !POSTAL_CODE.test(postalCode)) return { matches: null };
    return { matches: await this.geocodingService.postalCodeMatchesCity({ postalCode, city: comune.name }) };
  }

  /** Se i suggerimenti funzionano, senza chiamare Google (§324). */
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Get("status")
  status() {
    return { available: this.addressSuggestionsService.available() };
  }

  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Get("suggestions")
  suggestions(@Query("q") q?: string, @Query("session") session?: string, @Query("lat") lat?: string, @Query("lng") lng?: string) {
    if (!session || !SESSION.test(session)) throw new BadRequestException("Sessione non valida.");
    const latitude = lat !== undefined ? Number(lat) : undefined;
    const longitude = lng !== undefined ? Number(lng) : undefined;
    return this.addressSuggestionsService.suggest({ q: q ?? "", session, latitude, longitude });
  }

  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Get("place/:id")
  place(@Param("id") id: string, @Query("session") session?: string) {
    if (!/^[A-Za-z0-9_-]{10,300}$/.test(id)) throw new BadRequestException("Indirizzo non valido.");
    if (session && !SESSION.test(session)) throw new BadRequestException("Sessione non valida.");
    return this.addressSuggestionsService.place(id, session ?? "");
  }
}
