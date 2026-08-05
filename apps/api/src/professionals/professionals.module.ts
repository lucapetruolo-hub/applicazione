import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { GuidedRequestsModule } from "../guided-requests/guided-requests.module";
import { ProfessionalMetricsModule } from "../professional-metrics/professional-metrics.module";
import { ProfessionalsController } from "./professionals.controller";
import { ProfessionalsService } from "./professionals.service";

@Module({
  imports: [AuthModule, NotificationsModule, GuidedRequestsModule, ProfessionalMetricsModule],
  controllers: [ProfessionalsController],
  providers: [ProfessionalsService],
  exports: [ProfessionalsService],
})
export class ProfessionalsModule {}
