import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { AdminModule } from "../admin/admin.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { AuditLogModule } from "../audit-log/audit-log.module";
import { AdminFoundersController, AdminSubscriptionOfferController, FounderSpotsController, SubscriptionsController } from "./subscriptions.controller";
import { SubscriptionsService } from "./subscriptions.service";

@Module({
  imports: [AuthModule, AdminModule, NotificationsModule, AuditLogModule],
  controllers: [SubscriptionsController, FounderSpotsController, AdminFoundersController, AdminSubscriptionOfferController],
  providers: [SubscriptionsService],
  exports: [SubscriptionsService],
})
export class SubscriptionsModule {}
