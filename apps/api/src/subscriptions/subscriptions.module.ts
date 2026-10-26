import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { AdminModule } from "../admin/admin.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { AdminFoundersController, FounderSpotsController, SubscriptionsController } from "./subscriptions.controller";
import { SubscriptionsService } from "./subscriptions.service";

@Module({
  imports: [AuthModule, AdminModule, NotificationsModule],
  controllers: [SubscriptionsController, FounderSpotsController, AdminFoundersController],
  providers: [SubscriptionsService],
  exports: [SubscriptionsService],
})
export class SubscriptionsModule {}
