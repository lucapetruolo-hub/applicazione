import { Module } from "@nestjs/common";
import { EmailModule } from "../email/email.module";
import { BookingRemindersService } from "./booking-reminders.service";

@Module({
  imports: [EmailModule],
  providers: [BookingRemindersService],
})
export class BookingRemindersModule {}
