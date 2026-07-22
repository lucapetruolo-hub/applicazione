import { Module } from "@nestjs/common";
import { CategoriesController } from "./categories.controller";
import { CategoriesSeedService } from "./categories-seed.service";

@Module({
  controllers: [CategoriesController],
  providers: [CategoriesSeedService],
})
export class CategoriesModule {}
