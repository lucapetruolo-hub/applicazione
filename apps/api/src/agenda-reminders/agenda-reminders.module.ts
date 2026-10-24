import { Module } from "@nestjs/common";
import { NotificationsModule } from "../notifications/notifications.module";
import { AgendaRemindersService } from "./agenda-reminders.service";
import { AgendaTomorrowSummaryService } from "./agenda-tomorrow-summary.service";

@Module({
  imports: [NotificationsModule],
  providers: [AgendaRemindersService, AgendaTomorrowSummaryService],
})
export class AgendaRemindersModule {}
