"use client";

import { useRouter } from "next/navigation";
import { ALL_ITALIAN_CITY_NAMES } from "@professionisti/shared";
import { Eyebrow, SearchBar, Text, YStack, brand, type ProfessionalSuggestion, type SearchMode } from "@professionisti/ui";
import { buildSearchDestination } from "@/lib/searchNavigation";
import { buildSearchSuggestions } from "@/lib/searchSuggestions";

/**
 * Hero della homepage: la ricerca professionisti (A domicilio/Online + città
 * + Cerca) resta la funzione primaria, come prima del redesign — non un
 * form di richiesta guidata. Stesso motore di ricerca e stesso routing
 * (`buildSearchDestination`) già usato da `SearchHeader` nelle pagine
 * risultati, per non avere due comportamenti diversi tra i punti di
 * ingresso alla ricerca.
 */
export function HomeHero() {
  const router = useRouter();
  const professionalSuggestions: ProfessionalSuggestion[] = buildSearchSuggestions();

  function handleSearch(params: { query: string; city: string; professional?: ProfessionalSuggestion; mode: SearchMode }) {
    router.push(buildSearchDestination(params));
  }

  return (
    <YStack width="100%" backgroundColor={brand.gesso} paddingVertical="$9" paddingHorizontal="$4" alignItems="center" className="bp-grid">
      <YStack width="100%" maxWidth={780} alignItems="center" gap="$4">
        <Eyebrow>Preventivi verificati in 24h</Eyebrow>
        <Text
          fontFamily="$heading"
          fontWeight="800"
          fontSize={40}
          lineHeight={42}
          letterSpacing={-1}
          textAlign="center"
          $gtSm={{ fontSize: 56, lineHeight: 54 }}
        >
          Trova il professionista giusto, vicino a te.
        </Text>
        <Text fontSize="$5" color={brand.grafite70} textAlign="center" maxWidth={560}>
          Idraulici, elettricisti, imbianchini e altri professionisti verificati. Cerca per zona o scegli una
          consulenza online.
        </Text>

        <YStack width="100%" marginTop="$4">
          <SearchBar
            onSearch={handleSearch}
            professionalSuggestions={professionalSuggestions}
            citySuggestions={ALL_ITALIAN_CITY_NAMES}
          />
        </YStack>

        <Text fontFamily="$mono" fontSize={11} letterSpacing={0.6} textTransform="uppercase" color={brand.grafite70}>
          Ricerca gratuita · Nessuna registrazione
        </Text>
      </YStack>
    </YStack>
  );
}
