"use client";

import { useEffect, type ReactNode } from "react";
import type { PROFESSIONAL_CATEGORIES, ProfessionalSearchResult } from "@professionisti/shared";
import { YStack } from "@professionisti/ui";
import { CategoryIconBadge } from "@/components/CategoryIconBadge";
import { EmptySearchResults } from "@/components/EmptySearchResults";
import { ResultsListWithMap, type MapPoolQuery } from "@/components/ResultsListWithMap";
import { LoadErrorNotice } from "@/components/LoadErrorNotice";
import { saveLastSearchCity } from "@/lib/lastSearchCity";

type Category = (typeof PROFESSIONAL_CATEGORIES)[number];

export function CategoryContent({
  category,
  city,
  cityCenter,
  online,
  professionals,
  mapPool,
  loadFailed,
  initialUrgentOnly,
  footer,
}: {
  category: Category;
  city?: string;
  /** Centro del comune, per la mappa. */
  cityCenter?: [number, number];
  online?: boolean;
  professionals: ProfessionalSearchResult[];
  /** Tutti i professionisti della categoria (nessun filtro città), per i puntini sulla mappa: li chiede il browser. */
  mapPool?: MapPoolQuery;
  /** La ricerca non è arrivata dall'API: "Riprova" invece di "nessun risultato". */
  loadFailed?: boolean;
  /** Preimpostato dall'URL (?urgente=1) quando si arriva dal toggle "Intervento urgente?" della homepage. */
  initialUrgentOnly?: boolean;
  /** Sotto le schede, nella colonna dei risultati: "[Lavoro] a [città] in breve" (docs/CHANGELOG.md §349). */
  footer?: ReactNode;
}) {
  // Richiesta esplicita dell'utente: niente scheda "Ricerca / N
  // professionisti verificati trovati" (con i sotto-tag) in cima ai
  // risultati — la lista parla da sola. Il riquadro resta SOLO quando non
  // c'e' nessun risultato, perche' altrimenti la pagina sarebbe un vuoto
  // muto senza spiegazioni.
  // Per le voci di "Quanto costa in media" della home (§398).
  useEffect(() => {
    saveLastSearchCity(city);
  }, [city]);

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
      <YStack width="100%" maxWidth={1200} paddingHorizontal="$4" paddingVertical="$6">
        {/* Titolo principale (h1): da telefono si vede, in testo semplice sopra
            i filtri, perché chi arriva da Google legga subito "Idraulico a
            Latina" (collaudo N-15, scelto da Luca,
            docs/changelog/2026-10-30-velocita-telefono.md). Da computer resta
            solo per Google e i lettori di schermo: lì il riquadro in cima ai
            risultati era stato tolto su richiesta e la ricerca in alto dice
            già cosa si sta guardando (docs/CHANGELOG.md §271). */}
        {/* Senza risultati il titolo c'è già nel riquadro "nessun professionista". */}
        <h1 className={header ? "sr-only" : "results-title"}>{title}</h1>
        <ResultsListWithMap
          professionals={professionals}
          mapPool={mapPool}
          showMap
          city={city}
          cityCenter={cityCenter}
          header={header}
          defaultMode={online ? "ONLINE" : "HOME"}
          initialUrgentOnly={initialUrgentOnly}
          footer={footer}
        />
      </YStack>
    </YStack>
  );
}
