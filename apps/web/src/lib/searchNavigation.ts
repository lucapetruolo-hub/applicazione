import { comuneSlug, findCategoryByQuery } from "@professionisti/shared";
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
  if (isOnline) params.set("online", "1");
  if (urgentOnly) params.set("urgente", "1");

  const categorySlug = professional?.categorySlug ?? findCategoryByQuery(query)?.slug;
  if (categorySlug) {
    // Comune reale → pagina indicizzabile /cerca/[categoria]/[citta]
    // (docs/CHANGELOG.md §132); testo libero non riconosciuto resta `?citta=`.
    const citySlug = city.trim() ? comuneSlug(city) : undefined;
    if (city.trim() && !citySlug) params.set("citta", city.trim());
    const qs = params.toString() ? `?${params.toString()}` : "";
    return `/cerca/${categorySlug}${citySlug ? `/${citySlug}` : ""}${qs}`;
  }
  if (city.trim()) params.set("citta", city.trim());
  if (query.trim()) params.set("q", query.trim());
  const finalQs = params.toString() ? `?${params.toString()}` : "";
  return `/cerca${finalQs}`;
}
