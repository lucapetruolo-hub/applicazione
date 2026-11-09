import type { ProblemMatchResult, ProfessionalCategorySlug } from "@professionisti/shared";

/**
 * Mestieri da mostrare come pulsanti in cima ai risultati di un problema
 * (docs/changelog/2026-11-09-mestieri-proposti-pulsanti.md): quelli proposti,
 * nell'ordine, più quello scelto a mano se non c'era. Con un "fuori servizio"
 * o senza un mestiere scelto nessun pulsante.
 */
export function problemCategoryChoices(result: ProblemMatchResult, chosen: ProfessionalCategorySlug | null): ProfessionalCategorySlug[] {
  if (!chosen) return [];
  return result.categories.includes(chosen) ? result.categories : [chosen, ...result.categories];
}
