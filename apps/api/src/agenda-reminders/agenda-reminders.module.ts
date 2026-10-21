import { Module } from "@nestjs/common";
import { NotificationsModule } from "../notifications/notifications.module";
import { AgendaRemindersService } from "./agenda-reminders.service";

@Module({
  imports: [NotificationsModule],
  providers: [AgendaRemindersService],
})
export class AgendaRemindersModule {}
