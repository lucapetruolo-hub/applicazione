"use client";

import { useState } from "react";
import {
  MAX_CHOSEN_PROFESSIONALS,
  OUT_OF_SERVICE_KEYWORDS,
  normalizeProblemText,
  type ProblemMatchResult,
  type ProfessionalCategorySlug,
  type ProfessionalSearchResult,
} from "@professionisti/shared";
import { YStack } from "@professionisti/ui";
import { EmptySearchResults } from "@/components/EmptySearchResults";
import { ResultsListWithMap } from "@/components/ResultsListWithMap";
import { LoadErrorNotice } from "@/components/LoadErrorNotice";
import { ProblemBand } from "@/components/ProblemBand";
import { ChosenProsBar, chosenRequestHref, type ChosenPro } from "@/components/ChosenProsBar";

/** Ricerca partita dalla descrizione del problema (docs/CHANGELOG.md §387). */
export type ProblemSearch = {
  description: string;
  result: ProblemMatchResult;
  chosen: ProfessionalCategorySlug | null;
  questionDone: boolean;
};

/** "Perché" di una scheda: la prestazione del professionista che somiglia al problema. */
function problemReason(problem: ProblemSearch, pro: ProfessionalSearchResult): string | null {
  const keywords = problem.result.outOfService
    ? OUT_OF_SERVICE_KEYWORDS[problem.result.outOfService]
    : normalizeProblemText(problem.description)
        .split(" ")
        .filter((word) => word.length >= 5)
        .map((word) => word.slice(0, 5));
  const service = (pro.services ?? []).find((item) => {
    const name = normalizeProblemText(item.name);
    return keywords.some((keyword) => name.includes(` ${keyword}`));
  });
  if (service) return `offre «${service.name}»`;
  return problem.result.outOfService ? "lo dichiara nella sua descrizione" : null;
}

export function CercaContent({
  city,
  online,
  q,
  professionals,
  allProfessionals,
  loadFailed,
  initialUrgentOnly,
  problem,
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
  problem?: ProblemSearch;
}) {
  // "Scegli" sulle schede (docs/CHANGELOG.md §390): solo con un mestiere
  // deciso e almeno due professionisti, altrimenti non c'è niente da scegliere.
  const canChoose = Boolean(problem?.chosen) && professionals.length >= 2;
  const [chosenPros, setChosenPros] = useState<ChosenPro[]>([]);
  const chosenIds = new Set(chosenPros.map((pro) => pro.id));
  function toggleChosen(pro: ProfessionalSearchResult) {
    setChosenPros((current) =>
      current.some((item) => item.id === pro.id)
        ? current.filter((item) => item.id !== pro.id)
        : current.length < MAX_CHOSEN_PROFESSIONALS
          ? [...current, { id: pro.id, businessName: pro.businessName, imageUrl: pro.imageUrl ?? null, categorySlug: pro.categorySlug }]
          : current,
    );
  }

  const title = problem
    ? `Chi ti serve per «${problem.description.slice(0, 60)}»`
    : online
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
  const header = problem ? (
    <ProblemBand
      description={problem.description}
      city={city}
      result={problem.result}
      chosen={problem.chosen}
      count={professionals.length}
      questionDone={problem.questionDone}
      chosenPros={chosenPros}
      maxChosen={canChoose ? MAX_CHOSEN_PROFESSIONALS : undefined}
      onClearChosen={() => setChosenPros([])}
    />
  ) : loadFailed ? (
    <LoadErrorNotice title="Non riusciamo a caricare i professionisti" />
  ) : professionals.length > 0 ? null : (
    <EmptySearchResults title={title} online={Boolean(online)} city={city} />
  );

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
          merit={Boolean(problem)}
          reasonFor={problem ? (pro) => problemReason(problem, pro) : undefined}
          selection={
            canChoose
              ? {
                  selectedIds: chosenIds,
                  canAdd: chosenPros.length < MAX_CHOSEN_PROFESSIONALS,
                  max: MAX_CHOSEN_PROFESSIONALS,
                  onToggle: toggleChosen,
                }
              : undefined
          }
        />
      </YStack>
      {problem?.chosen && chosenPros.length > 0 ? (
        <ChosenProsBar
          chosen={chosenPros}
          max={MAX_CHOSEN_PROFESSIONALS}
          href={chosenRequestHref(chosenPros, problem.chosen, problem.description, city)}
        />
      ) : null}
    </YStack>
  );
}
