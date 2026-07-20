"use client";

import type { PROFESSIONAL_CATEGORIES } from "@professionisti/shared";
import { H1, Paragraph, Text, XStack, YStack } from "@professionisti/ui";

type Category = (typeof PROFESSIONAL_CATEGORIES)[number];

export function CategoryContent({ category, city }: { category: Category; city?: string }) {
  return (
    <YStack width="100%" maxWidth={1080} paddingHorizontal="$4" paddingVertical="$6" gap="$4">
      <YStack gap="$1">
        <H1 size="$8">
          {category.icon} {category.label}
          {city ? ` a ${city}` : " vicino a te"}
        </H1>
        <Paragraph color="$color10">
          Elenco professionisti in arrivo — a breve potrai vedere disponibilità, recensioni e richiedere un
          preventivo direttamente qui.
        </Paragraph>
      </YStack>

      <XStack flexWrap="wrap" gap="$2">
        {category.subTags.map((tag) => (
          <YStack key={tag} paddingHorizontal="$3" paddingVertical="$2" backgroundColor="$color3" borderRadius="$10">
            <Text fontSize="$2">{tag.replace(/-/g, " ")}</Text>
          </YStack>
        ))}
      </XStack>
    </YStack>
  );
}
