import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { EmailModule } from "../email/email.module";
import { GuidedRequestsModule } from "../guided-requests/guided-requests.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { RequestBoardController } from "./request-board.controller";
import { RequestBoardService } from "./request-board.service";

@Module({
  // AuthModule: JwtAuthGuard di "Rispondi" ha bisogno di JwtService.
  imports: [AuthModule, GuidedRequestsModule, EmailModule, NotificationsModule],
  controllers: [RequestBoardController],
  providers: [RequestBoardService],
  exports: [RequestBoardService],
})
export class RequestBoardModule {}
