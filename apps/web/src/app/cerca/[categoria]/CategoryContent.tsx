"use client";

import { useRouter } from "next/navigation";
import type { PROFESSIONAL_CATEGORIES, ProfessionalSearchResult } from "@professionisti/shared";
import { H1, Paragraph, ProfessionalCard, Text, XStack, YStack } from "@professionisti/ui";

type Category = (typeof PROFESSIONAL_CATEGORIES)[number];

export function CategoryContent({
  category,
  city,
  professionals,
}: {
  category: Category;
  city?: string;
  professionals: ProfessionalSearchResult[];
}) {
  const router = useRouter();

  return (
    <YStack width="100%" maxWidth={1080} paddingHorizontal="$4" paddingVertical="$6" gap="$4">
      <YStack gap="$1">
        <H1 size="$8">
          {category.icon} {category.label}
          {city ? ` a ${city}` : " vicino a te"}
        </H1>
        <Paragraph color="$color10">
          {professionals.length > 0
            ? `${professionals.length} professionist${professionals.length === 1 ? "a" : "i"} verificat${professionals.length === 1 ? "o" : "i"} trovat${professionals.length === 1 ? "o" : "i"}.`
            : "Nessun professionista trovato per questa zona: prova a cercare in un'altra città o richiedi un preventivo guidato."}
        </Paragraph>
      </YStack>

      <XStack flexWrap="wrap" gap="$2">
        {category.subTags.map((tag) => (
          <YStack key={tag} paddingHorizontal="$3" paddingVertical="$2" backgroundColor="$color3" borderRadius="$10">
            <Text fontSize="$2">{tag.replace(/-/g, " ")}</Text>
          </YStack>
        ))}
      </XStack>

      <YStack gap="$3">
        {professionals.map((pro) => (
          <ProfessionalCard
            key={pro.id}
            businessName={pro.businessName}
            categoryLabel={pro.categoryLabel}
            city={pro.city}
            rating={pro.rating ?? undefined}
            verified={pro.verified}
            onPress={() => router.push(`/professionista/${pro.id}`)}
          />
        ))}
      </YStack>
    </YStack>
  );
}
