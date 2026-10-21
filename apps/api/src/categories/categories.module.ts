import { Module } from "@nestjs/common";
import { CategoriesController } from "./categories.controller";
import { CategoriesSeedService } from "./categories-seed.service";
import { CategoriesService } from "./categories.service";

@Module({
  controllers: [CategoriesController],
  providers: [CategoriesSeedService, CategoriesService],
})
export class CategoriesModule {}
