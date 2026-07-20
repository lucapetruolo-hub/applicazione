"use client";

import { useRouter } from "next/navigation";
import { ITALIAN_CITIES, PLACEHOLDER_PROFESSIONALS, findCategoryByQuery } from "@professionisti/shared";
import { SearchBar, YStack, type ProfessionalSuggestion } from "@professionisti/ui";

const PROFESSIONAL_SUGGESTIONS: ProfessionalSuggestion[] = PLACEHOLDER_PROFESSIONALS.map((pro) => ({
  id: pro.businessName,
  name: pro.businessName,
  subtitle: `${pro.categoryLabel} · ${pro.city}`,
  categorySlug: pro.categorySlug,
  city: pro.city,
}));

export function CategorySearchHeader({
  initialQuery,
  initialCity,
}: {
  initialQuery: string;
  initialCity: string;
}) {
  const router = useRouter();

  function handleSearch({
    query,
    city,
    professional,
  }: {
    query: string;
    city: string;
    professional?: ProfessionalSuggestion;
  }) {
    const params = city.trim() ? `?citta=${encodeURIComponent(city.trim())}` : "";
    if (professional) {
      router.push(`/cerca/${professional.categorySlug}${params}`);
      return;
    }
    const category = findCategoryByQuery(query);
    if (category) {
      router.push(`/cerca/${category.slug}${params}`);
    }
  }

  return (
    <YStack width="100%" backgroundColor="$blue2" paddingVertical="$5" paddingHorizontal="$4" alignItems="center">
      <YStack width="100%" maxWidth={680}>
        <SearchBar
          onSearch={handleSearch}
          initialQuery={initialQuery}
          initialCity={initialCity}
          professionalSuggestions={PROFESSIONAL_SUGGESTIONS}
          citySuggestions={[...ITALIAN_CITIES]}
        />
      </YStack>
    </YStack>
  );
}
