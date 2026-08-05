import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { GuidedRequestsController } from "./guided-requests.controller";
import { GuidedRequestsService } from "./guided-requests.service";

@Module({
  imports: [AuthModule, NotificationsModule],
  controllers: [GuidedRequestsController],
  providers: [GuidedRequestsService],
  exports: [GuidedRequestsService],
})
export class GuidedRequestsModule {}
