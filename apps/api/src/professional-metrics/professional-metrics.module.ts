import { Module } from "@nestjs/common";
import { ProfessionalMetricsService } from "./professional-metrics.service";

@Module({
  providers: [ProfessionalMetricsService],
  exports: [ProfessionalMetricsService],
})
export class ProfessionalMetricsModule {}
