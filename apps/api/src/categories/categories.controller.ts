import { Controller, Get, Query } from "@nestjs/common";
import { PROFESSIONAL_CATEGORIES } from "@professionisti/shared";
import { CategoriesService } from "./categories.service";

@Controller("categories")
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Get()
  findAll() {
    return PROFESSIONAL_CATEGORIES;
  }

  // Pubblico, solo conteggi aggregati: ordina la scelta dei lavori con i più
  // cercati prima (docs/CHANGELOG.md §279).
  @Get("popular")
  getPopularity(@Query("city") city?: string) {
    return this.categoriesService.getPopularity(typeof city === "string" ? city.slice(0, 100) : undefined);
  }
}
