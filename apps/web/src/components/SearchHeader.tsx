"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon, SearchBar, brand, type ProfessionalSuggestion, type SearchMode } from "@professionisti/ui";
import styles from "./SearchHeader.module.css";
import { buildSearchDestination } from "@/lib/searchNavigation";
import { rememberSearchCity, useSearchBarHints } from "@/lib/useSearchBarHints";
import { navigateWithTransition } from "@/lib/viewTransition";
import { MagneticButton } from "./MagneticButton";

export function SearchHeader({
  initialQuery,
  initialCity,
  initialMode,
  service,
}: {
  initialQuery: string;
  initialCity: string;
  initialMode: SearchMode;
  /** Prestazione filtrata (voce di "Quanto costa in media", §398): resta cambiando città o modalità. */
  service?: string;
}) {
  const router = useRouter();
  // Da telefono il modulo completo occupava tutto il primo schermo e i
  // risultati comparivano solo scorrendo (revisione UX, docs/CHANGELOG.md
  // §271): parte chiuso, come una barra con la ricerca fatta e "Modifica".
  const [expanded, setExpanded] = useState(false);

  const searchHints = useSearchBarHints(initialQuery);

  async function handleSearch(params: { query: string; city: string; professional?: ProfessionalSuggestion; mode: SearchMode }) {
    rememberSearchCity(params.city);
    const destination = await buildSearchDestination({ ...params, service });
    // Richiesta esplicita dell'utente: cambiare "Online/A domicilio" dalla
    // barra di ricerca di una pagina risultati deve aggiornare SUBITO la
    // lista. Next.js 14 tiene in cache client-side (Router Cache) le pagine
    // gia' visitate: navigando verso lo STESSO percorso con query diverse
    // (es. /cerca/idraulico -> /cerca/idraulico?online=1) serviva la pagina
    // vecchia finche' non scadeva o si ricaricava a mano. staleTimes:0 in
    // next.config.mjs riduce ma non elimina il problema per le pagine gia'
    // nella cache della sessione: forziamo un refresh esplicito dopo il push
    // (in coda al push, cosi' vale sia per la navigazione nuova sia per una
    // eventuale risposta gia' in cache).
    setExpanded(false);
    navigateWithTransition(() => {
      router.push(destination);
      router.refresh();
    }, destination);
  }

  const what = initialQuery.trim() || "Tutti i professionisti";
  const where = [initialCity.trim() || (initialMode === "online" ? null : "Ovunque"), initialMode === "online" ? "Online" : "A domicilio"]
    .filter(Boolean)
    .join(" · ");

  return (
    // Nascosto da $gtMd in su (richiesta esplicita dell'utente: "sposta le
    // due stringhe di ricerca... sopra sulla barra fissa in alto"): su
    // desktop la ricerca vive ora nell'header fisso (SiteHeader.tsx +
    // HeaderSearchBar.tsx), questo banner resta solo su schermi stretti
    // dove la versione condensata nell'header non ha spazio a sufficienza.
    // HTML semplice, senza il calcolo degli stili di Tamagui
    // (docs/changelog/2026-11-09-barra-in-alto-senza-tamagui.md).
    <div className={`is_View ${styles.root}${expanded ? ` ${styles.rootExpanded}` : ""}`}>
      <div className={`is_View ${styles.inner}`}>
        {expanded ? (
          <div className={`is_View ${styles.expanded}`}>
            {/* "Chiudi" per tornare ai risultati senza cercare, e "Cerca"
                largo quanto i campi come in home (docs/CHANGELOG.md §349). */}
            <div className={`is_View ${styles.closeRow}`}>
              <button type="button" className="search-close" onClick={() => setExpanded(false)}>
                <Icon name="x" size={16} color={brand.grafite} />
                Chiudi
              </button>
            </div>
            <SearchBar
              wrapSearchButton={(button) => <MagneticButton block>{button}</MagneticButton>}
              onSearch={handleSearch}
              initialQuery={initialQuery}
              initialCity={initialCity}
              initialMode={initialMode}
              {...searchHints}
              searchOnModeChange
            />
          </div>
        ) : (
          <button type="button" className="search-summary" onClick={() => setExpanded(true)} aria-label={`Modifica la ricerca: ${what}, ${where}`}>
            {/* Come la pillola della barra su computer: il modo a sinistra, la
                lente verde a destra (docs/changelog/2026-11-09-barra-in-alto-semplice.md). */}
            <span className="search-summary-mode" aria-hidden="true">
              <Icon name={initialMode === "online" ? "video" : "house"} size={16} color={brand.cianografiaPieno} />
            </span>
            <span className={`is_View ${styles.summaryText}`}>
              <span className={`is_Text ${styles.what}`}>{what}</span>
              <span className={`is_Text ${styles.where}`}>{where}</span>
            </span>
            <span className="search-summary-go" aria-hidden="true">
              <Icon name="search" size={17} color="white" />
            </span>
          </button>
        )}
      </div>
    </div>
  );
}
