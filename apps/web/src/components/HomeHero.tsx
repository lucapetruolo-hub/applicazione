"use client";

import { useRouter } from "next/navigation";
import { ALL_ITALIAN_CITY_NAMES } from "@professionisti/shared";
import { Eyebrow, SearchBar, Text, YStack, brand, type ProfessionalSuggestion, type SearchMode } from "@professionisti/ui";
import { buildSearchDestination } from "@/lib/searchNavigation";
import { buildSearchSuggestions } from "@/lib/searchSuggestions";

/**
 * Hero della homepage: la ricerca professionisti (A domicilio/Online + città
 * + Cerca) resta la funzione primaria — non un form di richiesta guidata.
 * Stesso motore di ricerca e stesso routing (`buildSearchDestination`) già
 * usato da `SearchHeader` nelle pagine risultati, per non avere due
 * comportamenti diversi tra i punti di ingresso alla ricerca.
 *
 * Pannello verde pieno arrotondato al posto della griglia cianografica
 * (brief "Vicinato", CLAUDE.md §19): la ricerca vive dentro il pannello, non
 * su uno sfondo neutro.
 */
export function HomeHero() {
  const router = useRouter();
  const professionalSuggestions: ProfessionalSuggestion[] = buildSearchSuggestions();

  function handleSearch(params: { query: string; city: string; professional?: ProfessionalSuggestion; mode: SearchMode }) {
    router.push(buildSearchDestination(params));
  }

  return (
    <YStack width="100%" backgroundColor={brand.gesso} paddingTop="$6" paddingBottom="$5" paddingHorizontal="$4" alignItems="center">
      <YStack
        width="100%"
        maxWidth={1160}
        backgroundColor={brand.cianografia}
        borderRadius={40}
        paddingVertical="$8"
        paddingHorizontal="$5"
        alignItems="center"
        position="relative"
        overflow="hidden"
      >
        <YStack
          position="absolute"
          top={-140}
          left={-80}
          width={340}
          height={340}
          borderRadius={999}
          backgroundColor="rgba(255,255,255,0.12)"
        />
        <YStack
          position="absolute"
          bottom={-110}
          right={-40}
          width={230}
          height={230}
          borderRadius={999}
          backgroundColor={brand.ottone}
          opacity={0.22}
        />

        <YStack width="100%" maxWidth={720} alignItems="center" gap="$4" position="relative">
          <Eyebrow tone="dark">👋 Qualcuno del quartiere ti aiuta oggi</Eyebrow>
          <Text
            fontFamily="$heading"
            fontWeight="600"
            fontSize={38}
            lineHeight={42}
            letterSpacing={-0.5}
            textAlign="center"
            color="white"
            $gtSm={{ fontSize: 54, lineHeight: 56 }}
          >
            Il vicino di casa che sa sempre chi chiamare.
          </Text>
          <Text fontSize="$5" color="rgba(255,255,255,0.88)" textAlign="center" maxWidth={520}>
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

          <Text fontSize={13} fontWeight="600" color="rgba(255,255,255,0.75)">
            Ricerca gratuita · Nessuna registrazione
          </Text>
        </YStack>
      </YStack>
    </YStack>
  );
}
