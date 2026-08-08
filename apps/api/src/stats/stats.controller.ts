import { Controller, Get } from "@nestjs/common";
import { StatsService } from "./stats.service";

// Endpoint pubblico (nessuna autenticazione, sola lettura di due conteggi
// aggregati): alimenta la striscia "social proof" in homepage — richiesta
// esplicita dell'utente, numeri reali mai fabbricati.
@Controller("stats")
export class StatsController {
  constructor(private readonly statsService: StatsService) {}

  @Get("platform")
  getPlatformStats() {
    return this.statsService.getPlatformStats();
  }
}
