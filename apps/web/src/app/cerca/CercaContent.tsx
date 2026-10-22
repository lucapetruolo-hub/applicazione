"use client";

import type { ProfessionalSearchResult } from "@professionisti/shared";
import { YStack } from "@professionisti/ui";
import { EmptySearchResults } from "@/components/EmptySearchResults";
import { ResultsListWithMap } from "@/components/ResultsListWithMap";
import { LoadErrorNotice } from "@/components/LoadErrorNotice";

export function CercaContent({
  city,
  online,
  q,
  professionals,
  allProfessionals,
  loadFailed,
  initialUrgentOnly,
}: {
  city?: string;
  online?: boolean;
  q?: string;
  professionals: ProfessionalSearchResult[];
  /** Tutti i professionisti (nessun filtro città), per i puntini sulla mappa. */
  allProfessionals?: ProfessionalSearchResult[];
  /** La ricerca non è arrivata dall'API: "Riprova" invece di "nessun risultato". */
  loadFailed?: boolean;
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

  // Richiesta esplicita dell'utente: niente scheda "Ricerca / N
  // professionisti verificati trovati" in cima ai risultati — la lista parla
  // da sola. Il riquadro resta SOLO quando non c'e' nessun risultato.
  const header = loadFailed ? <LoadErrorNotice title="Non riusciamo a caricare i professionisti" /> : professionals.length > 0 ? null : <EmptySearchResults title={title} online={Boolean(online)} city={city} />;

  return (
    <YStack width="100%" alignItems="center" backgroundColor="transparent">
      {/* Titolo principale (h1), non mostrato (docs/CHANGELOG.md §271). */}
      <h1 className="sr-only">{title}</h1>
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
