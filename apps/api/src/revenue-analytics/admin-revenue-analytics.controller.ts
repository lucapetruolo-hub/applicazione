import { Controller, Get, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { AdminGuard } from "../admin/admin.guard";
import { RevenueAnalyticsService } from "./revenue-analytics.service";

/** Menu "Statistiche" / Revenue Analytics (richiesta esplicita dell'utente) — solo admin, stesso gate di ogni altra vista finanza/DAC7. */
@UseGuards(JwtAuthGuard, AdminGuard)
@Controller("admin")
export class AdminRevenueAnalyticsController {
  constructor(private readonly revenueAnalyticsService: RevenueAnalyticsService) {}

  @Get("revenue-analytics")
  getSummary() {
    return this.revenueAnalyticsService.getSummary();
  }
}
