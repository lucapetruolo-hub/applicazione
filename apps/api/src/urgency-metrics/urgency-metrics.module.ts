import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { AdminModule } from "../admin/admin.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { AdminUrgencyMetricsController } from "./urgency-metrics.controller";
import { UrgencyMetricsService } from "./urgency-metrics.service";

@Module({
  imports: [AuthModule, AdminModule, NotificationsModule],
  controllers: [AdminUrgencyMetricsController],
  providers: [UrgencyMetricsService],
})
export class UrgencyMetricsModule {}
