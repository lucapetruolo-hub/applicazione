"use client";

import type { ProfessionalSearchResult } from "@professionisti/shared";
import { H1, Paragraph, YStack } from "@professionisti/ui";
import { ResultsListWithMap } from "@/components/ResultsListWithMap";

export function CercaContent({
  city,
  online,
  q,
  professionals,
}: {
  city?: string;
  online?: boolean;
  q?: string;
  professionals: ProfessionalSearchResult[];
}) {
  const title = online
    ? "Consulenze online disponibili"
    : city
      ? `Professionisti a ${city}`
      : q
        ? `Risultati per "${q}"`
        : "Tutti i professionisti";

  return (
    <YStack width="100%" alignItems="center">
      <YStack width="100%" backgroundColor="$color2" paddingVertical="$6" paddingHorizontal="$4" alignItems="center">
        <YStack width="100%" maxWidth={1080} gap="$1">
          <H1 size="$8">{title}</H1>
          <Paragraph color="$color11">
            {professionals.length > 0
              ? `${professionals.length} professionist${professionals.length === 1 ? "a" : "i"} verificat${professionals.length === 1 ? "o" : "i"} trovat${professionals.length === 1 ? "o" : "i"}.`
              : online
                ? "Nessun professionista disponibile per consulenza online al momento."
                : "Nessun professionista trovato: prova con un'altra città o richiedi un preventivo guidato."}
          </Paragraph>
        </YStack>
      </YStack>

      <YStack width="100%" maxWidth={1080} paddingHorizontal="$4" paddingVertical="$6">
        <ResultsListWithMap professionals={professionals} showMap={!online} />
      </YStack>
    </YStack>
  );
}
