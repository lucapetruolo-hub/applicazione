import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { ProfessionalMetricsModule } from "../professional-metrics/professional-metrics.module";
import { TimelineModule } from "../timeline/timeline.module";
import { JobPaymentsModule } from "../job-payments/job-payments.module";
import { BookingsController } from "./bookings.controller";
import { BookingsService } from "./bookings.service";

@Module({
  imports: [AuthModule, NotificationsModule, ProfessionalMetricsModule, TimelineModule, JobPaymentsModule],
  controllers: [BookingsController],
  providers: [BookingsService],
})
export class BookingsModule {}
