import { useState } from "react";
import { FlatList } from "react-native";
import { useRouter } from "expo-router";
import { PROFESSIONAL_CATEGORIES, findCategoryByQuery } from "@professionisti/shared";
import { CategoryCard, SearchBar, H1, Paragraph, YStack } from "@professionisti/ui";

export default function HomeScreen() {
  const router = useRouter();
  const [errorSlug, setErrorSlug] = useState<string | null>(null);

  function handleSearch({ query, city }: { query: string; city: string }) {
    const category = findCategoryByQuery(query);
    if (!category) {
      setErrorSlug(query);
      return;
    }
    setErrorSlug(null);
    const params = city.trim() ? `?citta=${encodeURIComponent(city.trim())}` : "";
    router.push(`/cerca/${category.slug}${params}`);
  }

  return (
    <YStack flex={1} backgroundColor="white">
      <YStack padding="$4" gap="$3" backgroundColor="$blue2">
        <YStack gap="$1">
          <H1 size="$8">Trova il professionista giusto</H1>
          <Paragraph color="$color10">Idraulici, elettricisti, imbianchini vicino a te.</Paragraph>
        </YStack>
        <SearchBar onSearch={handleSearch} />
        {errorSlug ? <Paragraph color="$red10">Nessuna categoria trovata per &quot;{errorSlug}&quot;.</Paragraph> : null}
      </YStack>

      <FlatList
        contentContainerStyle={{ padding: 16, gap: 12 }}
        columnWrapperStyle={{ gap: 12 }}
        numColumns={2}
        data={PROFESSIONAL_CATEGORIES}
        keyExtractor={(category) => category.slug}
        renderItem={({ item }) => (
          <CategoryCard
            icon={item.icon}
            label={item.label}
            onPress={() => router.push(`/cerca/${item.slug}`)}
          />
        )}
      />
    </YStack>
  );
}
