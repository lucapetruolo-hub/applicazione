"use client";

import type { ProfessionalSearchResult } from "@professionisti/shared";
import { Eyebrow, Text, YStack, brand } from "@professionisti/ui";
import { ResultsListWithMap } from "@/components/ResultsListWithMap";

export function CercaContent({
  city,
  online,
  q,
  professionals,
  allProfessionals,
  initialUrgentOnly,
}: {
  city?: string;
  online?: boolean;
  q?: string;
  professionals: ProfessionalSearchResult[];
  /** Tutti i professionisti (nessun filtro città), per i puntini sulla mappa. */
  allProfessionals?: ProfessionalSearchResult[];
  /** Preimpostato dall'URL (?urgente=1) quando si arriva dal toggle "Intervento urgente?" della homepage. */
  initialUrgentOnly?: boolean;
}) {
  const title = online
    ? city
      ? `Consulenze online a ${city}`
      : "Consulenze online disponibili"
    : city
      ? `Professionisti a ${city}`
      : q
        ? `Risultati per "${q}"`
        : "Tutti i professionisti";

  // Nella colonna sinistra, in cima alla lista: allineato con l'inizio della
  // mappa a destra (stesso layout di riferimento miodottore.it).
  const header = (
    <YStack gap="$2" backgroundColor={brand.calce} borderWidth={1} borderColor={brand.filetto} borderRadius="$4" padding="$4">
      <Eyebrow>Ricerca</Eyebrow>
      <Text fontFamily="$heading" fontWeight="800" fontSize="$8" color={brand.grafite}>
        {title}
      </Text>
      <Text color={brand.grafite70} fontSize="$3">
        {professionals.length > 0
          ? `${professionals.length} professionist${professionals.length === 1 ? "a" : "i"} verificat${professionals.length === 1 ? "o" : "i"} trovat${professionals.length === 1 ? "o" : "i"}.`
          : online
            ? "Nessun professionista disponibile per consulenza online al momento."
            : "Nessun professionista trovato: prova con un'altra città o richiedi un preventivo guidato."}
      </Text>
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
