"use client";

import type { ProfessionalSearchResult } from "@professionisti/shared";
import { H1, Paragraph, YStack } from "@professionisti/ui";
import { ResultsListWithMap } from "@/components/ResultsListWithMap";

export function CercaContent({
  city,
  online,
  q,
  professionals,
  allProfessionals,
}: {
  city?: string;
  online?: boolean;
  q?: string;
  professionals: ProfessionalSearchResult[];
  /** Tutti i professionisti (nessun filtro città), per i puntini sulla mappa. */
  allProfessionals?: ProfessionalSearchResult[];
}) {
  const title = online
    ? "Consulenze online disponibili"
    : city
      ? `Professionisti a ${city}`
      : q
        ? `Risultati per "${q}"`
        : "Tutti i professionisti";

  // Nella colonna sinistra, in cima alla lista: allineato con l'inizio della
  // mappa a destra (stesso layout di riferimento miodottore.it).
  const header = (
    <YStack gap="$1" backgroundColor="$color2" borderRadius="$6" padding="$4">
      <H1 size="$7">{title}</H1>
      <Paragraph color="$color11" fontSize="$3">
        {professionals.length > 0
          ? `${professionals.length} professionist${professionals.length === 1 ? "a" : "i"} verificat${professionals.length === 1 ? "o" : "i"} trovat${professionals.length === 1 ? "o" : "i"}.`
          : online
            ? "Nessun professionista disponibile per consulenza online al momento."
            : "Nessun professionista trovato: prova con un'altra città o richiedi un preventivo guidato."}
      </Paragraph>
    </YStack>
  );

  return (
    <YStack width="100%" alignItems="center">
      <YStack width="100%" maxWidth={1200} paddingHorizontal="$4" paddingVertical="$6">
        <ResultsListWithMap
          professionals={professionals}
          allProfessionals={allProfessionals}
          showMap={!online}
          city={city}
          header={header}
        />
      </YStack>
    </YStack>
  );
}
