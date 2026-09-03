"use client";

import type { PROFESSIONAL_CATEGORIES, ProfessionalSearchResult } from "@professionisti/shared";
import { Text, XStack, YStack, brand } from "@professionisti/ui";
import { CategoryIconBadge } from "@/components/CategoryIconBadge";
import { ResultsListWithMap } from "@/components/ResultsListWithMap";

type Category = (typeof PROFESSIONAL_CATEGORIES)[number];

export function CategoryContent({
  category,
  city,
  online,
  professionals,
  allProfessionals,
  initialUrgentOnly,
}: {
  category: Category;
  city?: string;
  online?: boolean;
  professionals: ProfessionalSearchResult[];
  /** Tutti i professionisti della categoria (nessun filtro città), per i puntini sulla mappa. */
  allProfessionals?: ProfessionalSearchResult[];
  /** Preimpostato dall'URL (?urgente=1) quando si arriva dal toggle "Intervento urgente?" della homepage. */
  initialUrgentOnly?: boolean;
}) {
  // Richiesta esplicita dell'utente: niente scheda "Ricerca / N
  // professionisti verificati trovati" (con i sotto-tag) in cima ai
  // risultati — la lista parla da sola. Il riquadro resta SOLO quando non
  // c'e' nessun risultato, perche' altrimenti la pagina sarebbe un vuoto
  // muto senza spiegazioni.
  const header =
    professionals.length > 0 ? null : (
      <YStack gap="$2" backgroundColor={brand.calce} borderWidth={1} borderColor={brand.filetto} borderRadius="$4" padding="$4">
        <XStack alignItems="center" gap="$3">
          <CategoryIconBadge slug={category.slug} size={48} />
          <YStack gap="$1" flex={1} minWidth={0}>
            <Text fontFamily="$heading" fontWeight="800" fontSize="$6" color={brand.grafite}>
              {category.label}
              {online && city ? ` · consulenza online a ${city}` : online ? " · consulenza online" : city ? ` a ${city}` : " vicino a te"}
            </Text>
            <Text color={brand.grafite70} fontSize="$3">
              {online
                ? "Nessun professionista disponibile per consulenza online in questa categoria al momento."
                : "Nessun professionista trovato per questa zona: prova a cercare in un'altra città o richiedi un preventivo guidato."}
            </Text>
          </YStack>
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
          initialUrgentOnly={initialUrgentOnly}
        />
      </YStack>
    </YStack>
  );
}
