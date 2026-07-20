import { Controller, Get, Param, Query } from "@nestjs/common";
import { ProfessionalsService } from "./professionals.service";

@Controller("professionals")
export class ProfessionalsController {
  constructor(private readonly professionalsService: ProfessionalsService) {}

  @Get("search")
  search(@Query("category") category?: string, @Query("city") city?: string, @Query("q") q?: string) {
    return this.professionalsService.search({ category, city, q });
  }

  @Get(":id")
  getById(@Param("id") id: string) {
    return this.professionalsService.getById(id);
  }
}
