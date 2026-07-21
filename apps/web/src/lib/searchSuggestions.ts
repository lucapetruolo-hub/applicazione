import { PROFESSIONAL_CATEGORIES } from "@professionisti/shared";
import type { ProfessionalSuggestion } from "@professionisti/ui";

/**
 * Suggerimenti per il campo "Cosa cerchi": solo le categorie professionali
 * (`PROFESSIONAL_CATEGORIES`, packages/shared) — la stessa lista usata per
 * le caselle categoria cliccabili sotto la ricerca e, in futuro, per un
 * eventuale menu laterale. Un'unica fonte di verità, non tre elenchi
 * diversi da tenere allineati a mano.
 */
export function buildSearchSuggestions(): ProfessionalSuggestion[] {
  return PROFESSIONAL_CATEGORIES.map((category) => ({
    id: `category:${category.slug}`,
    name: category.label,
    subtitle: "Categoria",
    categorySlug: category.slug,
    city: "",
  }));
}
