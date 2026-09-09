"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ALL_ITALIAN_CITY_NAMES, PROFESSIONAL_CATEGORIES, isProfessionalCategorySlug } from "@professionisti/shared";
import { SearchBar, type ProfessionalSuggestion, type SearchMode } from "@professionisti/ui";
import { buildSearchDestination } from "@/lib/searchNavigation";
import { buildSearchSuggestions } from "@/lib/searchSuggestions";

/**
 * Versione condensata della ricerca, montata nella barra fissa in alto
 * (SiteHeader) al posto di "Servizi"/"Come funziona"/"Prezzi" — richiesta
 * esplicita dell'utente: "una volta effettuata la ricerca sposta le due
 * stringhe di ricerca 'cosa cerchi' e 'città' con il tasto 'cerca' sopra
 * sulla barra fissa in alto". Stessa logica di ricerca già in uso in
 * `SearchHeader.tsx` (il banner grande nel corpo pagina, che su desktop
 * viene ora nascosto — CLAUDE.md, sezione "Ricerca spostata nell'header
 * fisso"): mai duplicata, `handleSearch` è lo stesso identico pattern
 * (`buildSearchDestination` + `router.push` + `router.refresh()` per
 * bypassare il Router Cache di Next.js sulla stessa route).
 */
export function HeaderSearchBar() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const online = searchParams.get("online") === "1";
  const city = searchParams.get("citta") ?? "";
  const categorySlugFromPath = pathname.split("/")[2];
  const category = categorySlugFromPath && isProfessionalCategorySlug(categorySlugFromPath) ? PROFESSIONAL_CATEGORIES.find((c) => c.slug === categorySlugFromPath) : undefined;
  const query = category ? category.label : (searchParams.get("q") ?? "");

  const professionalSuggestions: ProfessionalSuggestion[] = buildSearchSuggestions();

  function handleSearch(params: { query: string; city: string; professional?: ProfessionalSuggestion; mode: SearchMode }) {
    const destination = buildSearchDestination(params);
    router.push(destination);
    router.refresh();
  }

  return (
    <SearchBar
      // Forza il remount quando cambiano pathname/query params (es. click
      // su un'altra categoria): SearchBar tiene query/città/modalità in
      // uno stato locale inizializzato una sola volta al mount — senza
      // questa key, mai reso `HeaderSearchBar` (montato una sola volta nel
      // layout globale) resterebbe fermo ai valori della prima visita.
      key={`${pathname}-${city}-${online}-${query}`}
      compact
      onSearch={handleSearch}
      initialQuery={query}
      initialCity={city}
      initialMode={online ? "online" : "domicilio"}
      professionalSuggestions={professionalSuggestions}
      citySuggestions={ALL_ITALIAN_CITY_NAMES}
      searchOnModeChange
    />
  );
}
