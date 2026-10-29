import { Module } from "@nestjs/common";
import { EmailModule } from "../email/email.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { TimelineModule } from "../timeline/timeline.module";
import { WhatsAppModule } from "../whatsapp/whatsapp.module";
import { BookingRemindersService } from "./booking-reminders.service";
import { BookingRepliesService } from "./booking-replies.service";

@Module({
  // NotificationsModule e TimelineModule: le risposte del cliente ai
  // pulsanti del promemoria WhatsApp (BookingRepliesService).
  imports: [EmailModule, WhatsAppModule, NotificationsModule, TimelineModule],
  providers: [BookingRemindersService, BookingRepliesService],
})
export class BookingRemindersModule {}
