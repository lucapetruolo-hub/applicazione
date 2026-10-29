import { SubscriptionsModule } from "../subscriptions/subscriptions.module";
import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { ProfessionalMetricsModule } from "../professional-metrics/professional-metrics.module";
import { TimelineModule } from "../timeline/timeline.module";
import { WhatsAppModule } from "../whatsapp/whatsapp.module";
import { QuotesController } from "./quotes.controller";
import { QuotesService } from "./quotes.service";

@Module({
  imports: [AuthModule, NotificationsModule, ProfessionalMetricsModule, TimelineModule, SubscriptionsModule, WhatsAppModule],
  controllers: [QuotesController],
  providers: [QuotesService],
})
export class QuotesModule {}
