import { Module } from "@nestjs/common";
import { HealthController } from "./health/health.controller";
import { CategoriesModule } from "./categories/categories.module";
import { PrismaModule } from "./prisma/prisma.module";
import { AuthModule } from "./auth/auth.module";
import { ProfessionalsModule } from "./professionals/professionals.module";

@Module({
  imports: [PrismaModule, CategoriesModule, AuthModule, ProfessionalsModule],
  controllers: [HealthController],
})
export class AppModule {}
