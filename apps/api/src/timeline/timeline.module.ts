import { Module } from "@nestjs/common";
import { NotificationsModule } from "../notifications/notifications.module";
import { RealtimeModule } from "../realtime/realtime.module";
import { TimelineService } from "./timeline.service";

@Module({
  // RealtimeModule: TimelineService pubblica un evento "chat_message" ad
  // ogni scrittura in cronologia (CTO — real-time chat via SSE).
  imports: [NotificationsModule, RealtimeModule],
  providers: [TimelineService],
  exports: [TimelineService],
})
export class TimelineModule {}
