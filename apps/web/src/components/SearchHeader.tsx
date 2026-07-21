"use client";

import { useRouter } from "next/navigation";
import { ALL_ITALIAN_CITY_NAMES, type ProfessionalSearchResult } from "@professionisti/shared";
import { SearchBar, YStack, type ProfessionalSuggestion, type SearchMode } from "@professionisti/ui";
import { buildSearchDestination } from "@/lib/searchNavigation";
import { buildSearchSuggestions } from "@/lib/searchSuggestions";

export function SearchHeader({
  initialQuery,
  initialCity,
  initialMode,
  professionals,
}: {
  initialQuery: string;
  initialCity: string;
  initialMode: SearchMode;
  professionals: ProfessionalSearchResult[];
}) {
  const router = useRouter();

  const professionalSuggestions: ProfessionalSuggestion[] = buildSearchSuggestions(professionals);

  function handleSearch(params: { query: string; city: string; professional?: ProfessionalSuggestion; mode: SearchMode }) {
    router.push(buildSearchDestination(params));
  }

  return (
    <YStack width="100%" backgroundColor="$blue2" paddingVertical="$5" paddingHorizontal="$4" alignItems="center">
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
