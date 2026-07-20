import { Module } from "@nestjs/common";
import { HealthController } from "./health/health.controller";
import { CategoriesModule } from "./categories/categories.module";
import { PrismaModule } from "./prisma/prisma.module";
import { AuthModule } from "./auth/auth.module";

@Module({
  imports: [PrismaModule, CategoriesModule, AuthModule],
  controllers: [HealthController],
})
export class AppModule {}
