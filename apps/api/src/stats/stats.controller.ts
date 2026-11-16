import { Controller, Get } from "@nestjs/common";
import { StatsService } from "./stats.service";
import { ShortCache, SUMMARY_CACHE_MS } from "../common/short-cache";

// Endpoint pubblico (nessuna autenticazione, sola lettura di due conteggi
// aggregati): alimenta la striscia "social proof" in homepage — richiesta
// esplicita dell'utente, numeri reali mai fabbricati.
@Controller("stats")
export class StatsController {
  // Un minuto di memoria breve: numero di riepilogo, uguale per tutti (docs/changelog/2026-11-16-traffico-elevato.md).
  private readonly cache = new ShortCache<Awaited<ReturnType<StatsService["getPlatformStats"]>>>(SUMMARY_CACHE_MS);

  constructor(private readonly statsService: StatsService) {}

  @Get("platform")
  getPlatformStats() {
    return this.cache.get("tutti", () => this.statsService.getPlatformStats());
  }
}
