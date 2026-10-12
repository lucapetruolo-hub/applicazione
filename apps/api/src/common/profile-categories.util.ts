import { PROFESSIONAL_CATEGORIES, type ProfessionalCategorySlug } from "@professionisti/shared";

type CategoryRef = { slug: string; label: string };

/**
 * Tutte le categorie di un profilo (docs/CHANGELOG.md §217): la principale
 * per prima, poi le aggiuntive nell'ordine dell'elenco del sito (la tabella
 * di collegamento non ricorda l'ordine di scelta).
 */
export function profileCategories(profile: { category: CategoryRef; extraCategories: CategoryRef[] }): { slug: ProfessionalCategorySlug; label: string }[] {
  const order = (slug: string) => PROFESSIONAL_CATEGORIES.findIndex((category) => category.slug === slug);
  const extras = profile.extraCategories.filter((extra) => extra.slug !== profile.category.slug).sort((a, b) => order(a.slug) - order(b.slug));
  return [profile.category, ...extras].map((category) => ({ slug: category.slug as ProfessionalCategorySlug, label: category.label }));
}
