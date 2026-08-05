import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { ProfessionalMetricsModule } from "../professional-metrics/professional-metrics.module";
import { QuotesController } from "./quotes.controller";
import { QuotesService } from "./quotes.service";

@Module({
  imports: [AuthModule, NotificationsModule, ProfessionalMetricsModule],
  controllers: [QuotesController],
  providers: [QuotesService],
})
export class QuotesModule {}
