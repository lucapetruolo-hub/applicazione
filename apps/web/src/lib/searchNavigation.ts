import { comuneSlug, findCategoryByQuery, matchProblem } from "@professionisti/shared";
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

  // Una descrizione del problema ("il rubinetto gocciola") va ai risultati con
  // la banda "Ti serve un…" (docs/CHANGELOG.md §387), non alla ricerca per nome.
  if (professional?.id.startsWith(PROBLEM_SUGGESTION_PREFIX) || (!professional && looksLikeProblem(query))) {
    params.set("problema", query.trim());
    if (city.trim()) params.set("citta", city.trim());
    return `/cerca?${params.toString()}`;
  }

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

/** Id del suggerimento "Ti serve…" nella barra di ricerca. */
export const PROBLEM_SUGGESTION_PREFIX = "problema:";

/** Un testo che non è il nome di un mestiere ma descrive un lavoro. */
export function looksLikeProblem(query: string): boolean {
  const text = query.trim();
  if (text.length < 3 || findCategoryByQuery(text)) return false;
  const match = matchProblem(text);
  return match.categories.length > 0 || match.safety !== null || match.outOfService !== null || text.split(/\s+/).length >= 3;
}
