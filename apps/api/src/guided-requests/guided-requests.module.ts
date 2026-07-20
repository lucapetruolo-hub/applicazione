import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { GuidedRequestsController } from "./guided-requests.controller";
import { GuidedRequestsService } from "./guided-requests.service";

@Module({
  imports: [AuthModule],
  controllers: [GuidedRequestsController],
  providers: [GuidedRequestsService],
  exports: [GuidedRequestsService],
})
export class GuidedRequestsModule {}
