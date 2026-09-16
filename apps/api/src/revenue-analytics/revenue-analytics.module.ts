import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { AdminModule } from "../admin/admin.module";
import { RevenueAnalyticsService } from "./revenue-analytics.service";
import { AdminRevenueAnalyticsController } from "./admin-revenue-analytics.controller";

// AuthModule importato ESPLICITAMENTE oltre ad AdminModule — non basta
// AdminModule da solo: importarlo internamente non ripropaga JwtService ai
// moduli che lo importano a loro volta (nessun `exports: [AuthModule]` su
// AdminModule). Stesso bug reale già documentato in CLAUDE.md §45
// (ExternalJobsModule dimenticava proprio questo import): senza, il
// bootstrap di Nest va in crash-loop risolvendo le dipendenze di
// JwtAuthGuard, usata dal controller di questo modulo insieme ad AdminGuard.
@Module({
  imports: [AuthModule, AdminModule],
  controllers: [AdminRevenueAnalyticsController],
  providers: [RevenueAnalyticsService],
})
export class RevenueAnalyticsModule {}
