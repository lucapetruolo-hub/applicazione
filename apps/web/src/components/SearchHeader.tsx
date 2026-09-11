"use client";

import { useRouter } from "next/navigation";
import { ALL_ITALIAN_CITY_NAMES } from "@professionisti/shared";
import { SearchBar, YStack, brand, type ProfessionalSuggestion, type SearchMode } from "@professionisti/ui";
import { buildSearchDestination } from "@/lib/searchNavigation";
import { buildSearchSuggestions } from "@/lib/searchSuggestions";
import { navigateWithTransition } from "@/lib/viewTransition";

export function SearchHeader({
  initialQuery,
  initialCity,
  initialMode,
}: {
  initialQuery: string;
  initialCity: string;
  initialMode: SearchMode;
}) {
  const router = useRouter();

  const professionalSuggestions: ProfessionalSuggestion[] = buildSearchSuggestions();

  function handleSearch(params: { query: string; city: string; professional?: ProfessionalSuggestion; mode: SearchMode }) {
    const destination = buildSearchDestination(params);
    // Richiesta esplicita dell'utente: cambiare "Online/A domicilio" dalla
    // barra di ricerca di una pagina risultati deve aggiornare SUBITO la
    // lista. Next.js 14 tiene in cache client-side (Router Cache) le pagine
    // gia' visitate: navigando verso lo STESSO percorso con query diverse
    // (es. /cerca/idraulico -> /cerca/idraulico?online=1) serviva la pagina
    // vecchia finche' non scadeva o si ricaricava a mano. staleTimes:0 in
    // next.config.mjs riduce ma non elimina il problema per le pagine gia'
    // nella cache della sessione: forziamo un refresh esplicito dopo il push
    // (in coda al push, cosi' vale sia per la navigazione nuova sia per una
    // eventuale risposta gia' in cache).
    navigateWithTransition(() => {
      router.push(destination);
      router.refresh();
    });
  }

  return (
    // Nascosto da $gtMd in su (richiesta esplicita dell'utente: "sposta le
    // due stringhe di ricerca... sopra sulla barra fissa in alto"): su
    // desktop la ricerca vive ora nell'header fisso (SiteHeader.tsx +
    // HeaderSearchBar.tsx), questo banner resta solo su schermi stretti
    // dove la versione condensata nell'header non ha spazio a sufficienza.
    <YStack
      width="100%"
      backgroundColor={brand.cianografiaVelo}
      paddingVertical="$5"
      paddingHorizontal="$4"
      alignItems="center"
      $gtMd={{ display: "none" }}
    >
      <YStack width="100%" maxWidth={680}>
        <SearchBar
          onSearch={handleSearch}
          initialQuery={initialQuery}
          initialCity={initialCity}
          initialMode={initialMode}
          professionalSuggestions={professionalSuggestions}
          citySuggestions={ALL_ITALIAN_CITY_NAMES}
          searchOnModeChange
        />
      </YStack>
    </YStack>
  );
}
