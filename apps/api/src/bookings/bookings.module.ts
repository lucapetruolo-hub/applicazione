import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { ProfessionalMetricsModule } from "../professional-metrics/professional-metrics.module";
import { BookingsController } from "./bookings.controller";
import { BookingsService } from "./bookings.service";

@Module({
  imports: [AuthModule, NotificationsModule, ProfessionalMetricsModule],
  controllers: [BookingsController],
  providers: [BookingsService],
})
export class BookingsModule {}
