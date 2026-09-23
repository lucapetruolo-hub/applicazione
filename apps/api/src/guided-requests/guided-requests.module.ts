import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { ProfessionalMetricsModule } from "../professional-metrics/professional-metrics.module";
import { TimelineModule } from "../timeline/timeline.module";
import { GuidedRequestsController } from "./guided-requests.controller";
import { GuidedRequestsService } from "./guided-requests.service";
import { GuidedRequestUserStateService } from "./guided-request-user-state.service";

@Module({
  imports: [AuthModule, NotificationsModule, ProfessionalMetricsModule, TimelineModule],
  controllers: [GuidedRequestsController],
  providers: [GuidedRequestsService, GuidedRequestUserStateService],
  exports: [GuidedRequestsService],
})
export class GuidedRequestsModule {}
