"use client";

import type { ReactNode } from "react";
import type { PROFESSIONAL_CATEGORIES, ProfessionalSearchResult } from "@professionisti/shared";
import { YStack } from "@professionisti/ui";
import { CategoryIconBadge } from "@/components/CategoryIconBadge";
import { EmptySearchResults } from "@/components/EmptySearchResults";
import { ResultsListWithMap } from "@/components/ResultsListWithMap";
import { LoadErrorNotice } from "@/components/LoadErrorNotice";

type Category = (typeof PROFESSIONAL_CATEGORIES)[number];

export function CategoryContent({
  category,
  city,
  online,
  professionals,
  allProfessionals,
  loadFailed,
  initialUrgentOnly,
  footer,
}: {
  category: Category;
  city?: string;
  online?: boolean;
  professionals: ProfessionalSearchResult[];
  /** Tutti i professionisti della categoria (nessun filtro città), per i puntini sulla mappa. */
  allProfessionals?: ProfessionalSearchResult[];
  /** La ricerca non è arrivata dall'API: "Riprova" invece di "nessun risultato". */
  loadFailed?: boolean;
  /** Preimpostato dall'URL (?urgente=1) quando si arriva dal toggle "Intervento urgente?" della homepage. */
  initialUrgentOnly?: boolean;
  /** Sotto le schede, nella colonna dei risultati: "[Lavoro] a [città] in breve" (docs/CHANGELOG.md §346). */
  footer?: ReactNode;
}) {
  // Richiesta esplicita dell'utente: niente scheda "Ricerca / N
  // professionisti verificati trovati" (con i sotto-tag) in cima ai
  // risultati — la lista parla da sola. Il riquadro resta SOLO quando non
  // c'e' nessun risultato, perche' altrimenti la pagina sarebbe un vuoto
  // muto senza spiegazioni.
  const title = `${category.label}${online && city ? ` · consulenza online a ${city}` : online ? " · consulenza online" : city ? ` a ${city}` : " vicino a te"}`;
  const header = loadFailed ? (
    <LoadErrorNotice title="Non riusciamo a caricare i professionisti" />
  ) : professionals.length > 0 ? null : (
      <EmptySearchResults
        title={title}
        online={Boolean(online)}
        categorySlug={category.slug}
        city={city}
        icon={<CategoryIconBadge slug={category.slug} size={48} />}
      />
    );

  return (
    <YStack width="100%" alignItems="center" backgroundColor="transparent">
      {/* Titolo principale (h1) per Google e i lettori di schermo, non
          mostrato: il riquadro in cima ai risultati era stato tolto su
          richiesta (docs/CHANGELOG.md §271). */}
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
          footer={footer}
        />
      </YStack>
    </YStack>
  );
}
