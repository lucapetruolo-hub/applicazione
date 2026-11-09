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

/** "Ti serve …" e "Di solito lo fa …": il nome della categoria non sempre regge la frase ("un Pulizie"). */
export const CATEGORY_WHO: Record<ProfessionalCategorySlug, string> = {
  idraulico: "un idraulico",
  elettricista: "un elettricista",
  imbianchino: "un imbianchino",
  pulizie: "un'impresa di pulizie",
  giardiniere: "un giardiniere",
  traslochi: "chi fa traslochi",
  fabbro: "un fabbro",
  climatizzazione: "un tecnico di caldaie e climatizzatori",
  muratore: "un muratore",
  falegname: "un falegname",
  tuttofare: "un tuttofare",
  elettrodomestici: "un tecnico di elettrodomestici",
  "tende-da-sole": "chi installa tende da sole e zanzariere",
  dogsitter: "un dogsitter",
  babysitter: "una babysitter",
};

/** "un muratore o un imbianchino", "a, b o c". */
export function joinWithOr(items: string[]): string {
  return items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} o ${items[items.length - 1]}`;
}
