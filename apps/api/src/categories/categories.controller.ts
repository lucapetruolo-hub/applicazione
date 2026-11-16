import { Controller, Get, Query } from "@nestjs/common";
import { PROFESSIONAL_CATEGORIES } from "@professionisti/shared";
import { CategoriesService } from "./categories.service";
import { ShortCache, SUMMARY_CACHE_MS } from "../common/short-cache";

@Controller("categories")
export class CategoriesController {
  // Un minuto di memoria breve: numero di riepilogo, uguale per tutti (docs/changelog/2026-11-16-traffico-elevato.md).
  private readonly popularityCache = new ShortCache<Awaited<ReturnType<CategoriesService["getPopularity"]>>>(SUMMARY_CACHE_MS);

  constructor(private readonly categoriesService: CategoriesService) {}

  @Get()
  findAll() {
    return PROFESSIONAL_CATEGORIES;
  }

  // Pubblico, solo conteggi aggregati: ordina la scelta dei lavori con i più
  // cercati prima (docs/CHANGELOG.md §280-§281).
  @Get("popular")
  getPopularity(@Query("city") city?: string) {
    const place = typeof city === "string" ? city.slice(0, 100) : undefined;
    return this.popularityCache.get((place ?? "").trim().toLowerCase(), () => this.categoriesService.getPopularity(place));
  }
}
