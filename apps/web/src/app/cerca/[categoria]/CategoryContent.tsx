"use client";

import { useEffect, type ReactNode } from "react";
import { MAX_CHOSEN_PROFESSIONALS, subTagLabel, type PROFESSIONAL_CATEGORIES, type ProfessionalSearchResult } from "@professionisti/shared";
import styles from "../ResultsPage.module.css";
import { CategoryIconBadge } from "@/components/CategoryIconBadge";
import { EmptySearchResults } from "@/components/EmptySearchResults";
import { ResultsListWithMap, type MapPoolQuery } from "@/components/ResultsListWithMap";
import { LoadErrorNotice } from "@/components/LoadErrorNotice";
import { ChosenProsBar, chosenRequestHref } from "@/components/ChosenProsBar";
import { saveLastSearchCity } from "@/lib/lastSearchCity";
import { useChosenPros } from "@/lib/useChosenPros";

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
  subTag,
}: {
  category: Category;
  city?: string;
  /** Specializzazione della pagina per servizio: una scelta a parte da quella del solo mestiere. */
  subTag?: string;
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

  // "+ Scegli" anche cercando un mestiere, come dal problema scritto
  // (docs/changelog/2026-11-03-scegli-ricerca-mestiere.md): la descrizione
  // del lavoro si scrive nel modulo della richiesta.
  const { chosen, selection, limitNotice } = useChosenPros({
    category: !loadFailed && professionals.length >= 2 ? category.slug : null,
    city,
    description: "",
    scope: subTag ? `servizio:${subTag}` : "",
    professionals,
  });

  // Pagina per servizio: la specializzazione anche nel titolo visibile, come
  // nel titolo della pagina, altrimenti H1 uguale alla pagina città (collaudo 08/11 E8-05).
  const service = subTag ? `: ${subTagLabel(subTag).toLowerCase()}` : "";
  const title = `${category.label}${online && city ? ` · consulenza online a ${city}` : online ? " · consulenza online" : city ? ` a ${city}` : " vicino a te"}${service}`;
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
    // HTML semplice, senza il calcolo degli stili di Tamagui
    // (docs/changelog/2026-11-09-barra-in-alto-senza-tamagui.md).
    <div className={`is_View ${styles.page}`}>
      <div className={`is_View ${styles.container}`}>
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
          selection={selection}
        />
      </div>
      {chosen.length > 0 ? (
        <ChosenProsBar chosen={chosen} max={MAX_CHOSEN_PROFESSIONALS} href={chosenRequestHref(chosen, category.slug, "", city)} notice={limitNotice} />
      ) : null}
    </div>
  );
}
