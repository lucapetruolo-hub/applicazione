"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { PROFESSIONAL_CATEGORIES, isProfessionalCategorySlug } from "@professionisti/shared";
import { SearchBar, type ProfessionalSuggestion, type SearchMode } from "@professionisti/ui";
import { useComuni } from "@/lib/comuniLazy";
import { buildSearchDestination } from "@/lib/searchNavigation";
import { useMediaQuery } from "@/lib/useMediaQuery";
import { rememberSearchCity, useSearchBarHints } from "@/lib/useSearchBarHints";
import { navigateWithTransition } from "@/lib/viewTransition";
import { MagneticButton } from "./MagneticButton";

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
  const categorySlugFromPath = pathname.split("/")[2];
  // Città nel percorso (/cerca/[categoria]/[citta], docs/CHANGELOG.md §132) o, per testo libero, in `?citta=`.
  const citySlugFromPath = pathname.split("/")[3];
  // Il nome del comune viene dall'elenco dei comuni, che non arriva con la
  // pagina (lib/comuniLazy.ts): solo sugli schermi dove questa barra si vede
  // ($gtMd), così il telefono non lo scarica per una barra nascosta.
  const wide = useMediaQuery("(min-width: 1021px)");
  const comuni = useComuni(Boolean(citySlugFromPath) && wide);
  const city = searchParams.get("citta") ?? (citySlugFromPath ? comuni?.findComuneBySlug(citySlugFromPath)?.name : undefined) ?? "";
  const category = categorySlugFromPath && isProfessionalCategorySlug(categorySlugFromPath) ? PROFESSIONAL_CATEGORIES.find((c) => c.slug === categorySlugFromPath) : undefined;
  // Prestazione filtrata da "Quanto costa in media" (§398): scritta nel campo e tenuta cambiando città.
  const service = searchParams.get("servizio")?.trim() || undefined;
  const query = category ? category.label : (searchParams.get("problema") ?? searchParams.get("q") ?? service ?? "");

  const searchHints = useSearchBarHints(query);

  async function handleSearch(params: { query: string; city: string; professional?: ProfessionalSuggestion; mode: SearchMode }) {
    rememberSearchCity(params.city);
    const destination = await buildSearchDestination({ ...params, service });
    navigateWithTransition(() => {
      router.push(destination);
      router.refresh();
    });
  }

  return (
    <SearchBar
      wrapSearchButton={(button) => <MagneticButton>{button}</MagneticButton>}
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
      {...searchHints}
      searchOnModeChange
    />
  );
}
