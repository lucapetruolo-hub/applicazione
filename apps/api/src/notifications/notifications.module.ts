import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { EmailModule } from "../email/email.module";
import { RealtimeModule } from "../realtime/realtime.module";
import { NotificationsController } from "./notifications.controller";
import { NotificationsService } from "./notifications.service";

@Module({
  // RealtimeModule: NotificationsService.notify pubblica ora anche un push
  // SSE oltre a scrivere la riga in tabella (CTO — real-time via SSE),
  // accelerando i badge/toast già esistenti senza sostituirli (restano
  // comunque leggibili via REST, il push è solo un acceleratore).
  // EmailModule: email al professionista per ogni nuovo lead (vedi
  // NotificationsService.emailNewLead).
  imports: [AuthModule, RealtimeModule, EmailModule],
  controllers: [NotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
