"use client";

import { useRouter } from "next/navigation";
import { findCategoryByQuery } from "@professionisti/shared";
import { SearchBar, YStack } from "@professionisti/ui";

export function CategorySearchHeader({
  initialQuery,
  initialCity,
}: {
  initialQuery: string;
  initialCity: string;
}) {
  const router = useRouter();

  function handleSearch({ query, city }: { query: string; city: string }) {
    const category = findCategoryByQuery(query);
    const params = city.trim() ? `?citta=${encodeURIComponent(city.trim())}` : "";
    if (category) {
      router.push(`/cerca/${category.slug}${params}`);
    }
  }

  return (
    <YStack width="100%" backgroundColor="$blue2" paddingVertical="$5" paddingHorizontal="$4" alignItems="center">
      <YStack width="100%" maxWidth={680}>
        <SearchBar onSearch={handleSearch} initialQuery={initialQuery} initialCity={initialCity} />
      </YStack>
    </YStack>
  );
}
