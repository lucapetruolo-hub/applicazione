import { Module } from "@nestjs/common";
import { RequestBoardController } from "./request-board.controller";
import { RequestBoardService } from "./request-board.service";

@Module({
  controllers: [RequestBoardController],
  providers: [RequestBoardService],
  exports: [RequestBoardService],
})
export class RequestBoardModule {}
