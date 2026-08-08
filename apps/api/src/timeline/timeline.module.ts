import { Module } from "@nestjs/common";
import { NotificationsModule } from "../notifications/notifications.module";
import { TimelineService } from "./timeline.service";

@Module({
  imports: [NotificationsModule],
  providers: [TimelineService],
  exports: [TimelineService],
})
export class TimelineModule {}
