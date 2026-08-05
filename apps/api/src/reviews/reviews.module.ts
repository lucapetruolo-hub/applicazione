import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { ProfessionalMetricsModule } from "../professional-metrics/professional-metrics.module";
import { ReviewsController } from "./reviews.controller";
import { ReviewsService } from "./reviews.service";

@Module({
  imports: [AuthModule, ProfessionalMetricsModule],
  controllers: [ReviewsController],
  providers: [ReviewsService],
})
export class ReviewsModule {}
