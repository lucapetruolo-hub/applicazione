"use client";

import type { PROFESSIONAL_CATEGORIES, ProfessionalSearchResult } from "@professionisti/shared";
import { Eyebrow, Text, XStack, YStack, brand } from "@professionisti/ui";
import { CategoryIconBadge } from "@/components/CategoryIconBadge";
import { ResultsListWithMap } from "@/components/ResultsListWithMap";

type Category = (typeof PROFESSIONAL_CATEGORIES)[number];

export function CategoryContent({
  category,
  city,
  online,
  professionals,
  allProfessionals,
}: {
  category: Category;
  city?: string;
  online?: boolean;
  professionals: ProfessionalSearchResult[];
  /** Tutti i professionisti della categoria (nessun filtro città), per i puntini sulla mappa. */
  allProfessionals?: ProfessionalSearchResult[];
}) {
  // Nella colonna sinistra, in cima alla lista: allineato con l'inizio della
  // mappa a destra (stesso layout di riferimento miodottore.it — "riquadro"
  // superiore e mappa che partono dalla stessa altezza).
  const header = (
    <YStack gap="$3" backgroundColor={brand.calce} borderWidth={1} borderColor={brand.filetto} borderRadius="$4" padding="$4">
      <XStack alignItems="center" gap="$3">
        <CategoryIconBadge slug={category.slug} size={56} />
        <YStack gap="$1" flex={1} minWidth={0}>
          <Eyebrow>Ricerca</Eyebrow>
          <Text fontFamily="$heading" fontWeight="800" fontSize="$8" color={brand.grafite}>
            {category.label}
            {online && city ? ` · consulenza online a ${city}` : online ? " · consulenza online" : city ? ` a ${city}` : " vicino a te"}
          </Text>
          <Text color={brand.grafite70} fontSize="$3">
            {professionals.length > 0
              ? `${professionals.length} professionist${professionals.length === 1 ? "a" : "i"} verificat${professionals.length === 1 ? "o" : "i"} trovat${professionals.length === 1 ? "o" : "i"}.`
              : online
                ? "Nessun professionista disponibile per consulenza online in questa categoria al momento."
                : "Nessun professionista trovato per questa zona: prova a cercare in un'altra città o richiedi un preventivo guidato."}
          </Text>
        </YStack>
      </XStack>
      <XStack flexWrap="wrap" gap="$2">
        {category.subTags.map((tag) => (
          <YStack key={tag} paddingHorizontal="$3" paddingVertical="$2" backgroundColor={brand.gesso} borderRadius="$10">
            <Text fontFamily="$body" fontWeight="700" fontSize={11} color={brand.grafite70}>
              {tag.replace(/-/g, " ")}
            </Text>
          </YStack>
        ))}
      </XStack>
    </YStack>
  );

  return (
    <YStack width="100%" alignItems="center" backgroundColor={brand.gesso}>
      <YStack width="100%" maxWidth={1200} paddingHorizontal="$4" paddingVertical="$6">
        <ResultsListWithMap
          professionals={professionals}
          allProfessionals={allProfessionals}
          showMap
          city={city}
          header={header}
          defaultMode={online ? "ONLINE" : "HOME"}
        />
      </YStack>
    </YStack>
  );
}
