import { findCategoryByQuery } from "@professionisti/shared";
import type { ProfessionalSuggestion, SearchMode } from "@professionisti/ui";

/**
 * Punto unico di routing per la barra di ricerca (home, header categoria,
 * header "tutti i professionisti"): stessa logica ovunque, per evitare che i
 * tre punti di ingresso alla ricerca si comportino in modo diverso.
 */
export function buildSearchDestination({
  query,
  city,
  professional,
  mode,
  urgentOnly,
}: {
  query: string;
  city: string;
  professional?: ProfessionalSuggestion;
  mode: SearchMode;
  /** Preseleziona il filtro "Intervento urgente?" (disponibilità nelle prossime 24h) già in pagina risultati, richiesta esplicita dell'utente dalla homepage. */
  urgentOnly?: boolean;
}): string {
  const isOnline = mode === "online";
  const params = new URLSearchParams();
  if (city.trim()) params.set("citta", city.trim());
  if (isOnline) params.set("online", "1");
  if (urgentOnly) params.set("urgente", "1");
  const qs = params.toString() ? `?${params.toString()}` : "";

  if (professional) {
    return `/cerca/${professional.categorySlug}${qs}`;
  }
  const category = findCategoryByQuery(query);
  if (category) {
    return `/cerca/${category.slug}${qs}`;
  }
  if (query.trim()) params.set("q", query.trim());
  const finalQs = params.toString() ? `?${params.toString()}` : "";
  return `/cerca${finalQs}`;
}
