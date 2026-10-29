import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { EmailModule } from "../email/email.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { TimelineModule } from "../timeline/timeline.module";
import { WhatsAppModule } from "../whatsapp/whatsapp.module";
import { BookingRemindersService } from "./booking-reminders.service";
import { BookingRepliesService } from "./booking-replies.service";
import { BookingRepliesController } from "./booking-replies.controller";

@Module({
  // NotificationsModule e TimelineModule: le risposte del cliente ai
  // pulsanti del promemoria WhatsApp (BookingRepliesService).
  imports: [
    AuthModule,
    EmailModule,
    WhatsAppModule,
    NotificationsModule,
    TimelineModule,
  ],
  controllers: [BookingRepliesController],
  providers: [BookingRemindersService, BookingRepliesService],
})
export class BookingRemindersModule {}
