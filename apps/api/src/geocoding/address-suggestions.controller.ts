import { BadRequestException, Controller, Get, Param, Query } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { AddressSuggestionsService } from "./address-suggestions.service";

const SESSION = /^[A-Za-z0-9-]{8,64}$/;

/**
 * Suggerimenti di indirizzo per i moduli del sito (docs/CHANGELOG.md §264).
 * Aperti anche a chi non ha fatto l'accesso (richiesta di preventivo), con un
 * limite per IP: chi scrive un indirizzo fa una richiesta ogni pausa di
 * battitura, non ogni lettera.
 */
@Controller("address")
export class AddressSuggestionsController {
  constructor(private readonly addressSuggestionsService: AddressSuggestionsService) {}

  /** Se i suggerimenti funzionano, senza chiamare Google (§315). */
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
