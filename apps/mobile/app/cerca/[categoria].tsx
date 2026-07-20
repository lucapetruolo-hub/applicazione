import { useLocalSearchParams } from "expo-router";
import { PROFESSIONAL_CATEGORIES, isProfessionalCategorySlug } from "@professionisti/shared";
import { H1, Paragraph, Text, View, XStack, YStack } from "@professionisti/ui";

export default function CategoryScreen() {
  const { categoria, citta } = useLocalSearchParams<{ categoria: string; citta?: string }>();

  if (!categoria || !isProfessionalCategorySlug(categoria)) {
    return (
      <YStack flex={1} padding="$4">
        <Text>Categoria non trovata.</Text>
      </YStack>
    );
  }

  const category = PROFESSIONAL_CATEGORIES.find((c) => c.slug === categoria)!;

  return (
    <YStack flex={1} padding="$4" gap="$4">
      <YStack gap="$1">
        <H1 size="$7">
          {category.icon} {category.label}
          {citta ? ` a ${citta}` : " vicino a te"}
        </H1>
        <Paragraph color="$color10">
          Elenco professionisti in arrivo — a breve potrai vedere disponibilità e richiedere un preventivo.
        </Paragraph>
      </YStack>

      <XStack flexWrap="wrap" gap="$2">
        {category.subTags.map((tag) => (
          <View key={tag} paddingHorizontal="$3" paddingVertical="$2" backgroundColor="$color3" borderRadius="$10">
            <Text fontSize="$2">{tag.replace(/-/g, " ")}</Text>
          </View>
        ))}
      </XStack>
    </YStack>
  );
}
