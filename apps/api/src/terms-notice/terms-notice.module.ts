import { Module } from "@nestjs/common";
import { NotificationsModule } from "../notifications/notifications.module";
import { TermsNoticeService } from "./terms-notice.service";

@Module({
  imports: [NotificationsModule],
  providers: [TermsNoticeService],
})
export class TermsNoticeModule {}
