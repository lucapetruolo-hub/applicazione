import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { ClientReviewsController } from "./client-reviews.controller";
import { ClientReviewsService } from "./client-reviews.service";

@Module({
  imports: [AuthModule],
  controllers: [ClientReviewsController],
  providers: [ClientReviewsService],
})
export class ClientReviewsModule {}
