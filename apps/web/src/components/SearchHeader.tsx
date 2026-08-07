"use client";

import { useRouter } from "next/navigation";
import { ALL_ITALIAN_CITY_NAMES } from "@professionisti/shared";
import { SearchBar, YStack, brand, type ProfessionalSuggestion, type SearchMode } from "@professionisti/ui";
import { buildSearchDestination } from "@/lib/searchNavigation";
import { buildSearchSuggestions } from "@/lib/searchSuggestions";

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
    router.push(buildSearchDestination(params));
  }

  return (
    <YStack width="100%" backgroundColor={brand.cianografiaVelo} paddingVertical="$5" paddingHorizontal="$4" alignItems="center">
      <YStack width="100%" maxWidth={680}>
        <SearchBar
          onSearch={handleSearch}
          initialQuery={initialQuery}
          initialCity={initialCity}
          initialMode={initialMode}
          professionalSuggestions={professionalSuggestions}
          citySuggestions={ALL_ITALIAN_CITY_NAMES}
        />
      </YStack>
    </YStack>
  );
}
