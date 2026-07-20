import { Controller, Get } from "@nestjs/common";
import { PROFESSIONAL_CATEGORIES } from "@professionisti/shared";

@Controller("categories")
export class CategoriesController {
  @Get()
  findAll() {
    return PROFESSIONAL_CATEGORIES;
  }
}
