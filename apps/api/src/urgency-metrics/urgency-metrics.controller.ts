import { Controller, Get, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { AdminGuard, RequireAdminScope } from "../admin/admin.guard";
import { UrgencyMetricsService } from "./urgency-metrics.service";

/** Numeri delle richieste urgenti, ultimi 7 giorni (docs/CHANGELOG.md §342). */
@UseGuards(JwtAuthGuard, AdminGuard)
@Controller("admin/urgency-metrics")
export class AdminUrgencyMetricsController {
  constructor(private readonly urgencyMetricsService: UrgencyMetricsService) {}

  @RequireAdminScope("ANY")
  @Get()
  get() {
    return this.urgencyMetricsService.compute();
  }
}
