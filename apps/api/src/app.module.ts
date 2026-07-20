import { Module } from "@nestjs/common";
import { HealthController } from "./health/health.controller";
import { CategoriesModule } from "./categories/categories.module";

@Module({
  imports: [CategoriesModule],
  controllers: [HealthController],
})
export class AppModule {}
