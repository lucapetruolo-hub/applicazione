import { PROFESSIONAL_CATEGORIES, type ProfessionalSearchResult } from "@professionisti/shared";
import type { ProfessionalSuggestion } from "@professionisti/ui";

/**
 * Suggerimenti per il campo "Cosa cerchi": categorie prima (così a campo
 * vuoto si vede subito "Idraulico, Elettricista, ..." come su
 * miodottore.it, non nomi di attività specifiche), poi i professionisti
 * reali per chi digita un nome che conosce già.
 */
export function buildSearchSuggestions(professionals: ProfessionalSearchResult[]): ProfessionalSuggestion[] {
  const categorySuggestions: ProfessionalSuggestion[] = PROFESSIONAL_CATEGORIES.map((category) => ({
    id: `category:${category.slug}`,
    name: category.label,
    subtitle: "Categoria",
    categorySlug: category.slug,
    city: "",
  }));

  const professionalSuggestions: ProfessionalSuggestion[] = professionals.map((pro) => ({
    id: pro.id,
    name: pro.businessName,
    subtitle: `${pro.categoryLabel} · ${pro.city}`,
    categorySlug: pro.categorySlug,
    city: pro.city,
  }));

  return [...categorySuggestions, ...professionalSuggestions];
}
