"use client";

import type { PROFESSIONAL_CATEGORIES, ProfessionalSearchResult } from "@professionisti/shared";
import { H1, Paragraph, Text, XStack, YStack } from "@professionisti/ui";
import { CategoryIconBadge } from "@/components/CategoryIconBadge";
import { CATEGORY_ACCENT } from "@/components/icons/CategoryIcons";
import { ResultsListWithMap } from "@/components/ResultsListWithMap";

type Category = (typeof PROFESSIONAL_CATEGORIES)[number];

export function CategoryContent({
  category,
  city,
  online,
  professionals,
}: {
  category: Category;
  city?: string;
  online?: boolean;
  professionals: ProfessionalSearchResult[];
}) {
  const accent = CATEGORY_ACCENT[category.slug as keyof typeof CATEGORY_ACCENT];

  return (
    <YStack width="100%" alignItems="center">
      <YStack width="100%" backgroundColor={accent?.bg ?? "$color2"} paddingVertical="$6" paddingHorizontal="$4" alignItems="center">
        <YStack width="100%" maxWidth={1080} gap="$3">
          <XStack alignItems="center" gap="$3">
            <CategoryIconBadge slug={category.slug} size={56} />
            <YStack gap="$1">
              <H1 size="$8">
                {category.label}
                {online ? " · consulenza online" : city ? ` a ${city}` : " vicino a te"}
              </H1>
              <Paragraph color="$color11">
                {professionals.length > 0
                  ? `${professionals.length} professionist${professionals.length === 1 ? "a" : "i"} verificat${professionals.length === 1 ? "o" : "i"} trovat${professionals.length === 1 ? "o" : "i"}.`
                  : online
                    ? "Nessun professionista disponibile per consulenza online in questa categoria al momento."
                    : "Nessun professionista trovato per questa zona: prova a cercare in un'altra città o richiedi un preventivo guidato."}
              </Paragraph>
            </YStack>
          </XStack>
        </YStack>
      </YStack>

      <YStack width="100%" maxWidth={1080} paddingHorizontal="$4" paddingVertical="$6" gap="$4">
        <XStack flexWrap="wrap" gap="$2">
          {category.subTags.map((tag) => (
            <YStack key={tag} paddingHorizontal="$3" paddingVertical="$2" backgroundColor="$color3" borderRadius="$10">
              <Text fontSize="$2">{tag.replace(/-/g, " ")}</Text>
            </YStack>
          ))}
        </XStack>

        <ResultsListWithMap professionals={professionals} showMap={!online} city={city} />
      </YStack>
    </YStack>
  );
}
