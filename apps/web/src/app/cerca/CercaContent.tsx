"use client";
"use no memo";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import {
  MAX_CHOSEN_PROFESSIONALS,
  OUT_OF_SERVICE_KEYWORDS,
  normalizeProblemText,
  type ProblemMatchResult,
  type ProfessionalCategorySlug,
  type ProfessionalSearchResult,
  serviceNameKey,
} from "@professionisti/shared";
import { brand } from "@professionisti/ui";
import styles from "./ResultsPage.module.css";
import { EmptySearchResults } from "@/components/EmptySearchResults";
import { ResultsListWithMap, type MapPoolQuery } from "@/components/ResultsListWithMap";
import { LoadErrorNotice } from "@/components/LoadErrorNotice";
import { ProblemBand } from "@/components/ProblemBand";
import { ChosenProsBar, chosenRequestHref } from "@/components/ChosenProsBar";
import { saveLastSearchCity } from "@/lib/lastSearchCity";
import { useChosenPros } from "@/lib/useChosenPros";
import { useComuni, type ComuniModule } from "@/lib/comuniLazy";

/** Suggerimenti di comuni mentre si scrive: pochi, per non riempire la pagina. */
function citySuggestions(text: string, comuni: ComuniModule | null): string[] {
  const typed = text.trim().toLowerCase();
  if (typed.length < 2 || !comuni) return [];
  return comuni.allItalianCityNames().filter((name) => name.toLowerCase().startsWith(typed)).slice(0, 8);
}

/** Ricerca partita dalla descrizione del problema (docs/CHANGELOG.md §392). */
export type ProblemSearch = {
  description: string;
  result: ProblemMatchResult;
  chosen: ProfessionalCategorySlug | null;
  questionDone: boolean;
  /** Quanti professionisti per ogni mestiere proposto, quando sono più di uno. */
  categoryCounts?: Partial<Record<ProfessionalCategorySlug, number>>;
};

/** "Perché" di una scheda: la prestazione del professionista che somiglia al problema. */
function problemReason(problem: ProblemSearch, pro: ProfessionalSearchResult): string | null {
  // La prestazione trovata dalla ricerca, la stessa messa in evidenza nella scheda.
  const matched = pro.matchedServiceId ? pro.services.find((item) => item.id === pro.matchedServiceId) : undefined;
  if (matched) return `offre «${matched.name}»`;
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
  cityCenter,
  online,
  q,
  service,
  professionals,
  mapPool,
  loadFailed,
  initialUrgentOnly,
  problem,
  alsoDoThisJob = [],
}: {
  city?: string;
  /** Centro del comune, per la mappa. */
  cityCenter?: [number, number];
  online?: boolean;
  q?: string;
  /** Prestazione scelta in "Quanto costa in media" (docs/CHANGELOG.md §398). */
  service?: string;
  professionals: ProfessionalSearchResult[];
  /** Tutti i professionisti (nessun filtro città), per i puntini sulla mappa: li chiede il browser. */
  mapPool?: MapPoolQuery;
  /** La ricerca non è arrivata dall'API: "Riprova" invece di "nessun risultato". */
  loadFailed?: boolean;
  /** Preimpostato dall'URL (?urgente=1) quando si arriva dal toggle "Intervento urgente?" della homepage. */
  initialUrgentOnly?: boolean;
  problem?: ProblemSearch;
  /** Altri mestieri con quel lavoro tra le prestazioni (ricerca per problema). */
  alsoDoThisJob?: ProfessionalSearchResult[];
}) {
  // Per le voci di "Quanto costa in media" della home (§398).
  useEffect(() => {
    saveLastSearchCity(city);
  }, [city]);

  // "Scegli" sulle schede (docs/CHANGELOG.md §393): solo con un mestiere
  // deciso e almeno due professionisti, altrimenti non c'è niente da scegliere.
  const canChoose = Boolean(problem?.chosen) && professionals.length >= 2;
  const {
    chosen: chosenPros,
    clear: clearChosen,
    selection,
    limitNotice,
  } = useChosenPros({
    category: canChoose ? (problem?.chosen ?? null) : null,
    city,
    description: problem?.description ?? "",
    scope: problem?.description ?? "",
    professionals,
  });

  const title = problem
    ? `Chi ti serve per «${problem.description.slice(0, 60)}»`
    : service
      ? city
        ? `Chi offre "${service}" a ${city}`
        : `Chi offre "${service}"`
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
  const notice = loadFailed ? <LoadErrorNotice title="Non riusciamo a caricare i professionisti" /> : professionals.length > 0 ? null : <EmptySearchResults title={title} online={Boolean(online)} city={city} />;

  // Arrivando da una voce di "Quanto costa in media" si dice quale
  // prestazione filtra l'elenco e come tornare a vedere tutti (§398).
  const allHref = (() => {
    const params = new URLSearchParams();
    if (city) params.set("citta", city);
    if (online) params.set("online", "1");
    if (q) params.set("q", q);
    const query = params.toString();
    return query ? `/cerca?${query}` : "/cerca";
  })();
  const router = useRouter();
  const [cityText, setCityText] = useState("");
  const comuni = useComuni();
  const submitCity = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const chosen = cityText.trim();
    if (!chosen || !service) return;
    const params = new URLSearchParams({ servizio: service, citta: chosen });
    if (online) params.set("online", "1");
    router.push(`/cerca?${params.toString()}`);
  };

  // Il filtro si toglie dalla ✕ sulla pastiglia, come nei filtri dei grandi
  // siti: un link "Mostra tutti" si capiva come "tutti quelli del servizio"
  // (Luca, §398).
  const serviceBar = service ? (
    <div className={`is_View ${styles.serviceBar}`}>
      <span className={`is_Text ${styles.serviceLabel}`}>Servizio</span>
      <Link href={allHref} className="service-chip" aria-label={`Togli il filtro ${service}`}>
        <span className="service-chip-label">{service}</span>
        <span className="service-chip-x" aria-hidden="true">
          <X size={14} strokeWidth={2.4} />
        </span>
      </Link>
      {/* Senza città l'elenco è di tutta Italia: si chiede dove, senza
          obbligare (§398). Con la città la si cambia dalla barra di ricerca,
          che tiene il servizio. */}
      {!city ? (
        <form className="service-city" onSubmit={submitCity} role="search" aria-label="Cerca vicino a te">
          <input
            className="service-city-input"
            value={cityText}
            onChange={(event) => setCityText(event.target.value)}
            placeholder="In che città?"
            aria-label="In che città ti serve?"
            list="service-city-list"
            autoComplete="address-level2"
          />
          <datalist id="service-city-list">
            {citySuggestions(cityText, comuni).map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
          <button type="submit" className="service-city-button" disabled={!cityText.trim()}>
            Cerca vicino
          </button>
        </form>
      ) : null}
      <style jsx>{`
        :global(.service-chip) {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          min-height: 40px;
          max-width: 100%;
          padding: 6px 6px 6px 14px;
          border-radius: 999px;
          border: 1px solid ${brand.cianografia};
          background-color: ${brand.cianografiaVelo};
          color: ${brand.cianografiaScuro};
          font-weight: 700;
          font-size: 15px;
          text-decoration: none;
          transition: background-color 0.15s ease;
        }
        :global(.service-chip:hover) {
          background-color: #d1e4df;
        }
        :global(.service-chip:focus-visible) {
          outline: 2px solid ${brand.cianografiaScuro};
          outline-offset: 2px;
        }
        .service-chip-label {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .service-chip-x {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          width: 28px;
          height: 28px;
          border-radius: 999px;
          background-color: ${brand.cianografiaPieno};
          color: #fff;
        }
        .service-city {
          display: flex;
          gap: 8px;
          flex: 1 1 260px;
          min-width: 0;
        }
        .service-city-input {
          flex: 1;
          min-width: 0;
          min-height: 40px;
          padding: 0 14px;
          border-radius: 999px;
          border: 1px solid ${brand.bordoCampo};
          background-color: ${brand.calce};
          color: ${brand.grafite};
          font-size: 16px;
          font-family: inherit;
        }
        .service-city-button {
          min-height: 40px;
          padding: 0 16px;
          border-radius: 999px;
          border: none;
          background-color: ${brand.cianografiaPieno};
          color: #fff;
          font-weight: 700;
          font-size: 15px;
          font-family: inherit;
          cursor: pointer;
          white-space: nowrap;
        }
        .service-city-button:disabled {
          opacity: 0.5;
          cursor: default;
        }
        .service-city-button:focus-visible,
        .service-city-input:focus-visible {
          outline: 2px solid ${brand.cianografiaScuro};
          outline-offset: 2px;
        }
        @media (prefers-reduced-motion: reduce) {
          :global(.service-chip) {
            transition: none;
          }
        }
      `}</style>
    </div>
  ) : null;
  // La prestazione scelta per il problema, solo se qualcuno nei risultati la offre davvero
  // (docs/changelog/2026-11-06-dizionario-prestazioni.md).
  const topService =
    problem?.result.service && problem.chosen === problem.result.categories[0]
      ? professionals.some((pro) => {
          const matched = pro.matchedServiceId ? pro.services.find((item) => item.id === pro.matchedServiceId) : undefined;
          return matched ? serviceNameKey(matched.name) === serviceNameKey(problem.result.service!) : false;
        })
        ? problem.result.service
        : null
      : null;
  const header = problem ? (
    <ProblemBand
      topService={topService}
      description={problem.description}
      city={city}
      result={problem.result}
      chosen={problem.chosen}
      count={professionals.length}
      questionDone={problem.questionDone}
      categoryCounts={problem.categoryCounts}
      otherTradesCount={alsoDoThisJob.length}
      chosenPros={chosenPros}
      maxChosen={canChoose ? MAX_CHOSEN_PROFESSIONALS : undefined}
      onClearChosen={clearChosen}
    />
  ) : serviceBar && notice ? (
    <div className={`is_View ${styles.stack}`}>
      {serviceBar}
      {notice}
    </div>
  ) : (serviceBar ?? notice);

  return (
    // HTML semplice, senza il calcolo degli stili di Tamagui
    // (docs/changelog/2026-11-09-barra-in-alto-senza-tamagui.md).
    <div className={`is_View ${styles.page}`}>
      {/* Titolo principale (h1), non mostrato (docs/CHANGELOG.md §271). */}
      <h1 className="sr-only">{title}</h1>
      <div className={`is_View ${styles.container}`}>
        <ResultsListWithMap
          professionals={professionals}
          mapPool={mapPool}
          showMap
          city={city}
          cityCenter={cityCenter}
          header={header}
          defaultMode={online ? "ONLINE" : "HOME"}
          initialUrgentOnly={initialUrgentOnly}
          merit={Boolean(problem)}
          problemDescription={problem?.description}
          reasonFor={problem ? (pro) => problemReason(problem, pro) : undefined}
          otherSection={
            alsoDoThisJob.length > 0
              ? {
                  title: "Potrebbero fare anche questo lavoro",
                  subtitle: "Sono di un altro mestiere, ma tra i loro lavori c'è anche questo.",
                  professionals: alsoDoThisJob,
                }
              : undefined
          }
          selection={selection}
        />
      </div>
      {problem?.chosen && chosenPros.length > 0 ? (
        <ChosenProsBar
          chosen={chosenPros}
          max={MAX_CHOSEN_PROFESSIONALS}
          href={chosenRequestHref(chosenPros, problem.chosen, problem.description, city)}
          notice={limitNotice}
        />
      ) : null}
    </div>
  );
}
