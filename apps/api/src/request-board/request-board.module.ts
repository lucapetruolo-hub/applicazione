import { Module } from "@nestjs/common";
import { EmailModule } from "../email/email.module";
import { GuidedRequestsModule } from "../guided-requests/guided-requests.module";
import { RequestBoardController } from "./request-board.controller";
import { RequestBoardService } from "./request-board.service";

@Module({
  imports: [GuidedRequestsModule, EmailModule],
  controllers: [RequestBoardController],
  providers: [RequestBoardService],
  exports: [RequestBoardService],
})
export class RequestBoardModule {}
