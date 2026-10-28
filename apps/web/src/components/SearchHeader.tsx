"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon, SearchBar, Text, XStack, YStack, brand, type ProfessionalSuggestion, type SearchMode } from "@professionisti/ui";
import { buildSearchDestination } from "@/lib/searchNavigation";
import { rememberSearchCity, useSearchBarHints } from "@/lib/useSearchBarHints";
import { navigateWithTransition } from "@/lib/viewTransition";
import { MagneticButton } from "./MagneticButton";

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
  // Da telefono il modulo completo occupava tutto il primo schermo e i
  // risultati comparivano solo scorrendo (revisione UX, docs/CHANGELOG.md
  // §271): parte chiuso, come una barra con la ricerca fatta e "Modifica".
  const [expanded, setExpanded] = useState(false);

  const searchHints = useSearchBarHints(initialQuery);

  function handleSearch(params: { query: string; city: string; professional?: ProfessionalSuggestion; mode: SearchMode }) {
    rememberSearchCity(params.city);
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
    setExpanded(false);
    navigateWithTransition(() => {
      router.push(destination);
      router.refresh();
    });
  }

  const what = initialQuery.trim() || "Tutti i professionisti";
  const where = [initialCity.trim() || (initialMode === "online" ? null : "Ovunque"), initialMode === "online" ? "Online" : "A domicilio"]
    .filter(Boolean)
    .join(" · ");

  return (
    // Nascosto da $gtMd in su (richiesta esplicita dell'utente: "sposta le
    // due stringhe di ricerca... sopra sulla barra fissa in alto"): su
    // desktop la ricerca vive ora nell'header fisso (SiteHeader.tsx +
    // HeaderSearchBar.tsx), questo banner resta solo su schermi stretti
    // dove la versione condensata nell'header non ha spazio a sufficienza.
    <YStack
      width="100%"
      backgroundColor={brand.cianografiaVelo}
      paddingVertical={expanded ? "$5" : "$3"}
      paddingHorizontal="$4"
      alignItems="center"
      $gtMd={{ display: "none" }}
    >
      <YStack width="100%" maxWidth={680}>
        {expanded ? (
          <YStack gap="$2">
            {/* "Chiudi" per tornare ai risultati senza cercare, e "Cerca"
                largo quanto i campi come in home (docs/CHANGELOG.md §349). */}
            <XStack justifyContent="flex-end">
              <button type="button" className="search-close" onClick={() => setExpanded(false)}>
                <Icon name="x" size={16} color={brand.grafite} />
                Chiudi
              </button>
            </XStack>
            <SearchBar
              wrapSearchButton={(button) => <MagneticButton block>{button}</MagneticButton>}
              onSearch={handleSearch}
              initialQuery={initialQuery}
              initialCity={initialCity}
              initialMode={initialMode}
              {...searchHints}
              searchOnModeChange
            />
          </YStack>
        ) : (
          <button type="button" className="search-summary" onClick={() => setExpanded(true)} aria-label={`Modifica la ricerca: ${what}, ${where}`}>
            <Icon name="search" size={18} color={brand.cianografiaScuro} />
            <YStack flex={1} minWidth={0} alignItems="flex-start">
              <Text fontWeight="700" fontSize={16} color={brand.grafite} numberOfLines={1}>
                {what}
              </Text>
              <Text fontSize={16} color={brand.grafite70} numberOfLines={1}>
                {where}
              </Text>
            </YStack>
            <XStack flexShrink={0}>
              <Text fontWeight="700" fontSize={16} color={brand.cianografiaScuro}>
                Modifica
              </Text>
            </XStack>
          </button>
        )}
      </YStack>
    </YStack>
  );
}
