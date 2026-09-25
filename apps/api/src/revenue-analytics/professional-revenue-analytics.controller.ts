import { Controller, Get, Query, Req, UseGuards } from "@nestjs/common";
import { professionalStatsQuerySchema, type ProfessionalStatsQuery } from "@professionisti/shared";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { JwtAuthGuard, type AuthenticatedRequest } from "../auth/jwt-auth.guard";
import { RevenueAnalyticsService } from "./revenue-analytics.service";

/**
 * "Statistiche" anche per il professionista (richiesta esplicita
 * dell'utente, CLAUDE.md §103) — stesso `RevenueAnalyticsService.
 * getSummary`, scoped ai soli lavori propri (`professionalProfileId`
 * risolto dal token, mai passato dal client). Nessun `AdminGuard` qui: un
 * professionista vede solo i propri dati, non serve un ruolo speciale.
 */
@UseGuards(JwtAuthGuard)
@Controller("professionals/me")
export class ProfessionalRevenueAnalyticsController {
  constructor(private readonly revenueAnalyticsService: RevenueAnalyticsService) {}

  @Get("revenue-analytics")
  async getMySummary(@Req() req: AuthenticatedRequest) {
    const professionalProfileId = await this.revenueAnalyticsService.resolveMyProfessionalProfileId(req.user.userId);
    return this.revenueAnalyticsService.getSummary(professionalProfileId);
  }

  /** Statistiche sul periodo scelto, con confronto col periodo precedente (docs/CHANGELOG.md §149). */
  @Get("stats")
  async getMyStats(@Req() req: AuthenticatedRequest, @Query(new ZodValidationPipe(professionalStatsQuerySchema)) query: ProfessionalStatsQuery) {
    const professionalProfileId = await this.revenueAnalyticsService.resolveMyProfessionalProfileId(req.user.userId);
    return this.revenueAnalyticsService.getProfessionalStats(professionalProfileId, query.from, query.to);
  }
}
