import { PROFESSIONAL_CATEGORIES, matchProblem, normalizeProblemText, subTagLabel, type ProfessionalCategorySlug } from "@professionisti/shared";

/**
 * Ricerca del pannello "Cambia" della richiesta di preventivo
 * (docs/changelog/2026-11-15-scelta-categoria-suggerita.md): trova i mestieri
 * dal nome ("idra"), dalle specializzazioni ("serrature") e dalle stesse
 * parole del dizionario dei problemi ("caldaia", "rubinetto",
 * `matchProblem`), così chi non sa il nome del mestiere lo trova lo stesso.
 * Restituisce gli slug nell'ordine dato, solo quelli che corrispondono.
 */
export function searchCategories(query: string, order: readonly ProfessionalCategorySlug[]): ProfessionalCategorySlug[] {
  const text = normalizeProblemText(query).trim();
  if (!text) return [...order];
  const found = new Set<ProfessionalCategorySlug>();
  for (const category of PROFESSIONAL_CATEGORIES) {
    const names = [category.slug, category.label, ...category.subTags, ...category.subTags.map(subTagLabel)].map((name) => normalizeProblemText(name).trim());
    if (names.some((name) => name.includes(text))) found.add(category.slug);
  }
  // Le parole del problema solo da 3 lettere in su: "ca" troverebbe mezzo dizionario.
  if (text.length >= 3) {
    for (const { slug } of matchProblem(query).categories) found.add(slug);
  }
  return order.filter((slug) => found.has(slug));
}
