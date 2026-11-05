import { PROFESSIONAL_CATEGORIES, type ProfessionalCategorySlug } from "@professionisti/shared";

type CategoryRef = { slug: string; label: string };

/**
 * Tutte le categorie di un profilo (docs/CHANGELOG.md §217): la principale
 * per prima, poi le aggiuntive nell'ordine scelto dal professionista
 * (`categoryOrder`, docs/changelog/2026-11-05-registrazione-colonna-unica.md)
 * e, per i profili salvati prima, nell'ordine dell'elenco del sito (la
 * tabella di collegamento non ricorda l'ordine di scelta).
 */
export function profileCategories(profile: {
  category: CategoryRef;
  extraCategories: CategoryRef[];
  categoryOrder?: string[];
}): { slug: ProfessionalCategorySlug; label: string }[] {
  const chosen = profile.categoryOrder ?? [];
  const order = (slug: string) => {
    const index = chosen.indexOf(slug);
    return index >= 0 ? index : chosen.length + PROFESSIONAL_CATEGORIES.findIndex((category) => category.slug === slug);
  };
  const extras = profile.extraCategories.filter((extra) => extra.slug !== profile.category.slug).sort((a, b) => order(a.slug) - order(b.slug));
  return [profile.category, ...extras].map((category) => ({ slug: category.slug as ProfessionalCategorySlug, label: category.label }));
}
