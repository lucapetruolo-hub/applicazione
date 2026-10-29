import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { EmailModule } from "../email/email.module";
import { RealtimeModule } from "../realtime/realtime.module";
import { WhatsAppModule } from "../whatsapp/whatsapp.module";
import { NotificationsController } from "./notifications.controller";
import { NotificationsService } from "./notifications.service";
import { ChatMessageEmailsService } from "./chat-message-emails.service";
import { HeldEmailsService } from "./held-emails.service";
import { NotificationEmailOffController } from "./notification-email-off.controller";

@Module({
  // RealtimeModule: NotificationsService.notify pubblica ora anche un push
  // SSE oltre a scrivere la riga in tabella (CTO — real-time via SSE),
  // accelerando i badge/toast già esistenti senza sostituirli (restano
  // comunque leggibili via REST, il push è solo un acceleratore).
  // EmailModule: email che accompagnano le notifiche (vedi
  // NotificationsService.notify). WhatsAppModule: "sto arrivando" e
  // appuntamento annullato anche su WhatsApp.
  imports: [AuthModule, RealtimeModule, EmailModule, WhatsAppModule],
  controllers: [NotificationsController, NotificationEmailOffController],
  providers: [NotificationsService, ChatMessageEmailsService, HeldEmailsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
