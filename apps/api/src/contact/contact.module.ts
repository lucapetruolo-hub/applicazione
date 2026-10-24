import { Module } from "@nestjs/common";
import { NotificationsModule } from "../notifications/notifications.module";
import { ContactController } from "./contact.controller";
import { ContactService } from "./contact.service";

@Module({
  // NotificationsModule: presa in carico delle segnalazioni di contenuti
  // illegali inviate da chi non ha un account (docs/CHANGELOG.md §318).
  imports: [NotificationsModule],
  controllers: [ContactController],
  providers: [ContactService],
})
export class ContactModule {}
