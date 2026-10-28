import { Module } from "@nestjs/common";
import { EmailModule } from "../email/email.module";
import { WhatsAppModule } from "../whatsapp/whatsapp.module";
import { BookingRemindersService } from "./booking-reminders.service";

@Module({
  imports: [EmailModule, WhatsAppModule],
  providers: [BookingRemindersService],
})
export class BookingRemindersModule {}
