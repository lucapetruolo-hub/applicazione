"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Check, ChevronDown, ChevronUp, CreditCard, Info, Map as MapIcon, Maximize2, Minimize2, Plus, RotateCw, ShieldCheck, SlidersHorizontal, X, Zap } from "lucide-react";
import {
  PROFILE_REQUEST_SOURCE_PARAM,
  PUBLIC_AGENDA_DAYS,
  RESULT_FILTER_PARAMS,
  SEARCH_RADIUS_KM,
  activeResultFilterCount,
  agendaToPreviewDays,
  resultFilterEntries,
  resultsPageQuery,
  type ProfessionalPin,
  type ProfessionalSearchPage,
  type ProfessionalSearchResult,
  type ResultFilters,
  professionalPath,
  subTagLabel,
} from "@professionisti/shared";
import type { ProfessionalSearchQuery } from "@professionisti/api-client";
import { Icon, ProfessionalCard, Text, XStack, YStack, brand } from "@professionisti/ui";
import { IconActionButton } from "@/components/IconActionButton";
import { apiClient } from "@/lib/apiClient";
import { CARD_PHOTO, ProfessionalAvatar } from "@/components/ProfessionalAvatar";
import { useMediaQuery } from "@/lib/useMediaQuery";
import { useSavedProfessionals } from "@/lib/useSavedProfessionals";
import { navigateWithTransition } from "@/lib/viewTransition";
import { CHOICE_PROFILE_PARAM } from "@/lib/chosenProsStore";
import { PROBLEM_PROFILE_PARAM, requestDescriptionParam } from "@/lib/requestDescription";
import type { MapAvailability, MapBounds, MapProfessional } from "./ResultsMap";
import { closeOnBackdrop } from "@/lib/closeOnBackdrop";
import { ResultsPager } from "@/components/ResultsPager";

// Cuoricino sull'angolo della foto: sul bordo del cerchio, dentro l'angolo
// arrotondato del rettangolo.
const heartOffset = CARD_PHOTO.shape === "portrait" ? { right: 6, bottom: 6 } : { right: 0, bottom: 0 };

// La mappa (Google Maps) vive solo nel browser: mai importata lato server (CLAUDE.md
// §5.4 vale per l'SEO delle pagine, non per un widget lato client come
// questo — niente da indicizzare in una mappa interattiva).
const ResultsMap = dynamic(() => import("./ResultsMap").then((mod) => mod.ResultsMap), { ssr: false });

/** Scheda o puntino della mappa: i link servono a tutti e due. */
type LinkablePro = ProfessionalPin & Partial<Pick<ProfessionalSearchResult, "matchedServiceId" | "services">>;

/** Nome della prestazione cercata (`?servizio=`) che il professionista offre, se c'è (§398). */
function matchedServiceName(pro: LinkablePro): string | undefined {
  if (pro.matchedServiceName) return pro.matchedServiceName;
  return pro.matchedServiceId ? pro.services?.find((service) => service.id === pro.matchedServiceId)?.name : undefined;
}

/**
 * Indirizzo del profilo. Arrivando da una voce di "Quanto costa in media" porta
 * con sé la prestazione, così "Richiedi preventivo" sul profilo parte con il
 * lavoro già scritto (§398).
 */
function profileHref(pro: LinkablePro, extra: Record<string, string>, problem?: string): string {
  // Dalla ricerca per problema il profilo riceve il problema scritto, non la
  // prestazione: la richiesta parte con le parole del cliente e la visita non
  // si conta come arrivata da "Quanto costa" (§399).
  const service = problem ? undefined : matchedServiceName(pro);
  const params = new URLSearchParams({ ...extra, ...(problem ? { [PROBLEM_PROFILE_PARAM]: problem } : service ? { servizio: service } : {}) });
  const query = params.toString();
  return `${professionalPath(pro)}${query ? `?${query}` : ""}`;
}

/** Descrizione della richiesta già scritta: il problema cercato, altrimenti la prestazione cercata (§398). */
function serviceDescriptionParam(pro: LinkablePro, problem?: string): string {
  return requestDescriptionParam(problem, matchedServiceName(pro));
}

/** Stessa inquadratura, a meno di un soffio (Google la ricalcola riaprendo la mappa). */
function sameBounds(a: MapBounds | null, b: MapBounds | null): boolean {
  if (!a || !b) return a === b;
  const eps = 1e-5;
  return (
    Math.abs(a.north - b.north) < eps &&
    Math.abs(a.south - b.south) < eps &&
    Math.abs(a.east - b.east) < eps &&
    Math.abs(a.west - b.west) < eps
  );
}

/** Stessi filtri (per non ricaricare la pagina chiudendo il pannello senza cambiare nulla). */
function sameFilters(a: ResultFilters, b: ResultFilters): boolean {
  return JSON.stringify(resultFilterEntries(a)) === JSON.stringify(resultFilterEntries(b));
}

/** Attesa prima di chiedere la pagina dopo uno spostamento della mappa o un filtro toccato. */
const REFRESH_DELAY_MS = 350;

/**
 * Ricerca senza città per i puntini della mappa (stessi filtri della pagina):
 * la fa il browser quando la mappa si apre, non il server prima di mandare
 * la pagina, che così arriva prima (collaudo N-02,
 * docs/changelog/2026-10-30-velocita-telefono.md). Da telefono la mappa parte
 * chiusa: chi non la apre non la scarica. Arrivano solo puntini leggeri, tutti
 * i trovati (scelta di Luca, docs/changelog/2026-11-16-pagine-da-20.md).
 */
export type MapPoolQuery = Omit<ProfessionalSearchQuery, "city" | "track">;

/**
 * Pagina mostrata: quella del server, oppure quella chiesta dal browser per
 * l'inquadratura della mappa (`bounds`), con il suo numero di pagina.
 */
/** Una sezione di schede sotto i risultati, con titolo e riga sotto. */
export type OtherResultsSection = { title: string; subtitle: string; professionals: ProfessionalSearchResult[] };

type AreaPage = { key: string; data: ProfessionalSearchPage };

export function ResultsListWithMap({
  page,
  search,
  filters,
  mapPool,
  showMap,
  city,
  cityCenter,
  header,
  footer,
  otherSection,
  nextTradeSection,
  defaultMode,
  problemDescription,
  reasonFor,
  merit = false,
  selection,
}: {
  /**
   * Pagina di risultati preparata dal server (20 schede, filtri e ordine
   * calcolati dall'API, docs/changelog/2026-11-16-pagine-da-20.md).
   */
  page: ProfessionalSearchPage;
  /** Parametri della ricerca della pagina: il browser li riusa per la zona della mappa e per il numero nei Filtri. */
  search: ProfessionalSearchQuery;
  /** Filtri accesi (dall'indirizzo, più la specializzazione della pagina per servizio). */
  filters: ResultFilters;
  /**
   * Ricerca senza città per i puntini sulla mappa (es. stessa categoria, nessun filtro città).
   * Muovendo/zoomando la mappa la colonna a sinistra si aggiorna mostrando chi è visibile nell'inquadratura corrente.
   * Senza (nessuna città cercata): `search`, la ricerca è già quella.
   */
  mapPool?: MapPoolQuery;
  showMap: boolean;
  /** Città cercata, come scritta nel comune (es. "Latina"). */
  city?: string;
  /** Centro del comune cercato, dal server: se non ci sono professionisti con coordinate, la mappa zooma comunque qui invece di sparire. */
  cityCenter?: [number, number];
  /** Contenuto mostrato in cima alla colonna sinistra, allineato con l'inizio della mappa (titolo/filtri categoria). */
  header?: ReactNode;
  /**
   * Contenuto subito sotto le schede, nella stessa colonna (es. "[Lavoro] a
   * [città] in breve", docs/CHANGELOG.md §349): fuori dalla colonna finiva
   * sotto l'altezza della mappa e con un solo risultato lasciava un vuoto di
   * 900 px che sembrava una pagina rotta.
   */
  footer?: ReactNode;
  /**
   * Seconda sezione sotto le schede, con le stesse schede: "Potrebbero fare
   * anche questo lavoro" nella ricerca per problema
   * (docs/changelog/2026-11-03-preventivo-descrizione-per-prima.md).
   */
  otherSection?: OtherResultsSection;
  /**
   * Dopo l'ultima pagina, i professionisti dell'altro mestiere proposto (es.
   * "battiscopa staccato": finiti i muratori, i falegnami), con un titolo
   * loro: due elenchi uno dopo l'altro, non mescolati (giro di prova del 17/11,
   * docs/changelog/2026-11-17-ricerca-home-in-attesa.md).
   */
  nextTradeSection?: OtherResultsSection & { moreHref?: string; moreLabel?: string };
  /** Tab di default della mini-agenda di ogni card (richiesta esplicita dell'utente): "a domicilio" se cercato a domicilio, "online" se cercato online. */
  defaultMode?: "HOME" | "ONLINE";
  /** Problema scritto nella ricerca: arriva già scritto nella richiesta, dalla scheda e dal profilo. */
  problemDescription?: string;
  /** Riga "Perché" di ogni scheda, dalla descrizione del problema (docs/CHANGELOG.md §392). */
  reasonFor?: (pro: ProfessionalSearchResult) => string | null;
  /** Ordine senza i pacchetti di visibilità (dalla descrizione del problema, decisione di Luca, §392). */
  merit?: boolean;
  /** "Scegli" su ogni scheda: fino a 5 professionisti a cui mandare la richiesta (docs/CHANGELOG.md §393). */
  selection?: {
    selectedIds: ReadonlySet<string>;
    /** Si può ancora sceglierne un altro (sotto il massimo). */
    canAdd: boolean;
    max: number;
    onToggle: (pro: ProfessionalSearchResult) => void;
    /** Tocco su "Scegli" oltre il massimo: mostra l'avviso. */
    onBlocked?: () => void;
  };
}) {
  // Fuori da React Compiler: usa `<style jsx>` (docs/CHANGELOG.md §345).
  "use no memo";
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // Con "Scegli" il profilo sa di arrivare da qui: mostra "Torna ai risultati"
  // e lo stesso "Scegli" (docs/changelog/2026-11-03-scelti-restano.md).
  const fromChoice: Record<string, string> = selection ? { [CHOICE_PROFILE_PARAM]: "1" } : {};
  const { canSave, savedIds, pendingId, toggleSave } = useSavedProfessionals();
  const fallbackCenter = cityCenter;

  // Inquadratura attuale della mappa (null finché non c'è). Da computer la
  // lista mostra subito chi ci sta dentro.
  const [liveBounds, setLiveBounds] = useState<MapBounds | null>(null);
  // Professionista aperto nell'anteprima della mappa: da computer la sua
  // scheda in lista ha un bordo verde sottile (docs/changelog/2026-11-05-anteprima-mappa.md).
  const [mapSelectedId, setMapSelectedId] = useState<string | null>(null);
  // Da telefono la mappa si apre a schermo intero (richiesta di Luca,
  // riferimento miodottore.it, docs/changelog/2026-11-04-mappa-schermo-intero.md):
  // spostandola la lista non cambia finché non si tocca "Cerca in quest'area".
  // `startBounds` è l'inquadratura con cui si apre, `areaBounds` l'ultima
  // zona cercata: chiudendo la mappa la lista mostra solo chi c'è dentro.
  const [startBounds, setStartBounds] = useState<MapBounds | null>(null);
  const [areaBounds, setAreaBounds] = useState<MapBounds | null>(null);
  // Una passata della barra di attesa in cima alla mappa a ogni "Cerca in
  // quest'area" (docs/changelog/2026-11-05-barra-di-attesa.md): la lista si
  // aggiorna subito, la barra dice che la ricerca è partita.
  const [areaSweep, setAreaSweep] = useState(0);
  // Da mobile la mappa parte chiusa: si apre solo toccando il bottone nella
  // barra in alto. Da desktop resta sempre visibile a fianco della lista,
  // indipendentemente da questo stato (vedi regola CSS dedicata sotto).
  const [mobileMapOpen, setMobileMapOpen] = useState(false);
  const mapToggleRef = useRef<HTMLButtonElement>(null);
  const mapCloseRef = useRef<HTMLButtonElement>(null);
  const listTopRef = useRef<HTMLDivElement>(null);
  // "Espandi mappa" (riferimento miodottore.it): allarga la colonna mappa a
  // scapito della lista, solo da desktop — da mobile la mappa è già a piena
  // larghezza quando aperta, non ha senso "espanderla" ulteriormente.
  const [mapExpanded, setMapExpanded] = useState(false);
  // Con Leaflet (in uso fino a docs/CHANGELOG.md §133) una mappa
  // inizializzata dentro un contenitore nascosto (display:none, lato
  // mobile prima del tap su "Mostra mappa") calcola un pixel-origin interno
  // corrotto che poi NON si ricalcola in modo affidabile nemmeno con
  // invalidateSize()+fitBounds successivi (verificato: marker finivano a
  // coordinate come x:-239880 e la lista restava vuota). L'unica soluzione
  // robusta è non montare affatto <ResultsMap> finché non sarà davvero
  // visibile: da mobile solo dopo il tap, da desktop solo una volta
  // rilevato via matchMedia di essere sopra la soglia dei 700px. Tenuto
  // anche con Google Maps: evita di caricare lo script finché non serve.
  const [shouldMountMap, setShouldMountMap] = useState(false);

  // Bug reale segnalato dall'utente: "scorrendo verso il basso la mappa va
  // leggermente in basso... non deve spostarsi per niente". Un primo
  // tentativo (sincronizzare via JS l'altezza della colonna mappa a quella
  // ESATTA della colonna lista, qualunque fosse la più bassa delle due) ha
  // introdotto un SECONDO bug reale, anch'esso segnalato dall'utente: con
  // un solo risultato la mappa si rimpiccioliva visibilmente invece di
  // restare alla sua dimensione normale — impostare la colonna più bassa
  // del contenuto della mappa (per costringere lo sticky a restare
  // ancorato) faceva effettivamente rimpicciolire l'area mappa renderizzata,
  // non solo il suo contenitore. I due requisiti ("mai spostarsi" e "mai
  // rimpicciolirsi") sono in tensione reale sotto `position: sticky` puro:
  // lo slack di uno sticky è sempre `altezza contenitore - altezza
  // elemento`, e l'unico modo di avere slack senza mai ridurre l'altezza
  // della mappa è dare alla colonna un'altezza MAGGIORE di quella naturale
  // della mappa (mai minore) — un margine di sicurezza, non un
  // adattamento esatto alla lista. `align-items: stretch` (già in uso
  // prima di questo giro di fix, mai la causa del rimpicciolimento: si
  // limita ad allungare ENTRAMBE le colonne all'altezza della più alta
  // delle due, non riduce mai nulla) resta quindi il meccanismo di base;
  // aggiunto solo un margine minimo fisso (`--map-slack`, letto nel CSS
  // sotto) che garantisce sempre almeno ~280px di slack reale allo sticky
  // anche con un solo risultato — sufficiente a coprire lo scroll
  // realistico di una pagina di risultati corta (che di per sé ha poco
  // altro da scorrere) senza introdurre un vuoto enorme sotto la mappa.
  // Montata la prima volta che serve (mappa aperta da telefono o schermo
  // largo), poi resta montata.
  const wideScreen = useMediaQuery("(min-width: 700px)");
  if ((mobileMapOpen || wideScreen) && !shouldMountMap) setShouldMountMap(true);

  // Tutti i trovati come puntini leggeri, chiesti quando la mappa si monta
  // (vedi MapPoolQuery): sulla mappa si vedono tutti, non solo la pagina.
  const [pins, setPins] = useState<ProfessionalPin[] | null>(null);
  const pinsKey = JSON.stringify([mapPool ?? search, filters]);
  useEffect(() => {
    if (!shouldMountMap) return;
    let active = true;
    const [query, pinFilters] = JSON.parse(pinsKey) as [ProfessionalSearchQuery, ResultFilters];
    apiClient.getProfessionalPins(query, resultsPageQuery(pinFilters)).then(
      (list) => {
        if (active) setPins(list);
      },
      // Senza risposta la mappa resta con le schede della pagina.
      () => undefined,
    );
    return () => {
      active = false;
    };
  }, [shouldMountMap, pinsKey]);

  function handleBoundsChange(bounds: MapBounds) {
    // Su mobile la mappa parte chiusa (display:none) ma resta montata: una mappa
    // inizializzata in un contenitore di dimensione zero calcola un
    // inquadramento degenere (nord/sud e/o est/ovest coincidenti), che
    // filtrerebbe fuori tutti i professionisti dalla lista pur mostrando il
    // conteggio corretto nell'intestazione — bug reale riscontrato dall'utente
    // (14 professionisti trovati ma lista vuota). Ignoriamo un inquadramento
    // di questo tipo invece di applicarlo.
    if (!(bounds.north > bounds.south) || !(bounds.east > bounds.west)) return;
    setLiveBounds(bounds);
    setStartBounds((prev) => prev ?? bounds);
  }

  // Da computer la lista segue la mappa appena la si sposta (l'inquadratura
  // d'apertura mostra la pagina del server, senza una seconda richiesta); da
  // telefono solo l'ultima zona cercata con "Cerca in quest'area".
  const bounds = wideScreen ? (liveBounds && !sameBounds(liveBounds, startBounds) ? liveBounds : null) : areaBounds;
  const phoneMapOpen = mobileMapOpen && !wideScreen;
  // "Cerca in quest'area" compare solo dopo aver spostato o zoomato la mappa.
  const areaMoved = liveBounds !== null && !sameBounds(liveBounds, areaBounds ?? startBounds);

  // Pagina della zona della mappa, chiesta all'API con l'inquadratura: prima
  // chi è nella ricerca per luogo, poi gli altri visibili (come prima nel browser).
  const [areaPageNumber, setAreaPageNumber] = useState(1);
  const [areaPage, setAreaPage] = useState<AreaPage | null>(null);
  const areaKey = bounds ? JSON.stringify([search, filters, bounds, areaPageNumber]) : null;
  useEffect(() => {
    if (!areaKey) return;
    let active = true;
    const [query, areaFilters, area, number] = JSON.parse(areaKey) as [ProfessionalSearchQuery, ResultFilters, MapBounds, number];
    const timer = setTimeout(() => {
      apiClient.searchProfessionalsPage({ ...query, track: false }, resultsPageQuery(areaFilters, number, area)).then(
        (data) => {
          if (!active) return;
          setAreaPage({ key: areaKey, data });
        },
        // Senza risposta resta la lista di prima.
        () => undefined,
      );
    }, REFRESH_DELAY_MS);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [areaKey]);
  // Spostando la mappa si riparte dalla prima pagina della zona.
  const boundsKey = bounds ? JSON.stringify(bounds) : null;
  const [lastBoundsKey, setLastBoundsKey] = useState<string | null>(null);
  if (boundsKey !== lastBoundsKey) {
    setLastBoundsKey(boundsKey);
    setAreaPageNumber(1);
  }
  // Finché la zona non è arrivata resta la pagina di prima (la zona
  // precedente o quella del server): niente lista vuota a metà.
  const shown: ProfessionalSearchPage = bounds && areaPage ? areaPage.data : page;
  const areaLoading = Boolean(areaKey) && areaPage?.key !== areaKey;

  function closePhoneMap() {
    setMobileMapOpen(false);
    // Il fuoco torna al pulsante "Mappa" da cui si era partiti.
    requestAnimationFrame(() => mapToggleRef.current?.focus());
  }

  // Mappa a schermo intero: la pagina sotto non scorre, Esc chiude, il
  // fuoco va sulla X.
  useEffect(() => {
    if (!phoneMapOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    mapCloseRef.current?.focus();
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      setMobileMapOpen(false);
      requestAnimationFrame(() => mapToggleRef.current?.focus());
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [phoneMapOpen]);

  // Pannello filtri (richiesta esplicita dell'utente, riferimento
  // miodottore.it: bottone "Filtri" sopra "Mostra mappa", apre un pannello
  // con "Consulenza online", "Date disponibili" e "Lingua parlata"). I filtri
  // stanno nell'indirizzo e li applica l'API su tutti i trovati, non solo
  // sulla pagina (docs/changelog/2026-11-16-pagine-da-20.md): nel pannello
  // si toccano in bozza e valgono alla chiusura.
  const [showFilters, setShowFilters] = useState(false);
  const [draft, setDraft] = useState<ResultFilters>(filters);
  const [languageQuery, setLanguageQuery] = useState("");
  // Sezioni ad accordion (richiesta esplicita dell'utente, riferimento
  // miodottore.it): un titolo per sezione, click per espandere/richiudere —
  // "Date disponibili" aperta di default quando si arriva già con
  // "Intervento urgente?" preselezionato dalla homepage (per rendere subito
  // visibile che il filtro è attivo), altrimenti "Consulenza online" come
  // prima.
  const [expandedSection, setExpandedSection] = useState<"online" | "availability" | "language" | "insurance" | "payment" | null>(
    filters.urgent ? "availability" : "online",
  );
  const filterOnlineOnly = Boolean(draft.online);
  const filterUrgentOnly = Boolean(draft.urgent);
  const filterAvailability = draft.availability ?? "any";
  const selectedLanguage = draft.language ?? null;
  const filterInsuredOnly = Boolean(draft.insured);
  const filterOnlinePaymentOnly = Boolean(draft.onlinePayment);
  const setFlag = (name: "online" | "urgent" | "insured" | "onlinePayment") => () =>
    setDraft((current) => {
      const { [name]: on, ...rest } = current;
      return on ? rest : { ...rest, [name]: true };
    });
  const setFilterOnlineOnly = setFlag("online");
  const setFilterUrgentOnly = setFlag("urgent");
  const setFilterInsuredOnly = setFlag("insured");
  const setFilterOnlinePaymentOnly = setFlag("onlinePayment");
  const setFilterAvailability = (value: "any" | "today" | "3days") =>
    setDraft(({ availability: _old, ...rest }) => (value === "any" ? rest : { ...rest, availability: value }));
  const setSelectedLanguage = (value: string | null) => setDraft(({ language: _old, ...rest }) => (value ? { ...rest, language: value } : rest));

  // Numero per "Mostra N risultati" in fondo al pannello (richiesta esplicita
  // dell'utente, riferimento miodottore.it): chiesto all'API per la bozza.
  const [draftCount, setDraftCount] = useState<{ key: string; total: number } | null>(null);
  const draftKey = showFilters && !sameFilters(draft, filters) ? JSON.stringify([search, draft, bounds]) : null;
  useEffect(() => {
    if (!draftKey) return;
    let active = true;
    const [query, draftFilters, area] = JSON.parse(draftKey) as [ProfessionalSearchQuery, ResultFilters, MapBounds | null];
    const timer = setTimeout(() => {
      apiClient.searchProfessionalsPage({ ...query, track: false }, resultsPageQuery(draftFilters, 1, area ?? undefined)).then(
        (data) => active && setDraftCount({ key: draftKey, total: data.total }),
        () => undefined,
      );
    }, REFRESH_DELAY_MS);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [draftKey]);
  const filteredResultsCount = draftKey === null ? shown.total : draftCount?.key === draftKey ? draftCount.total : null;

  /** Indirizzo della stessa ricerca con altri filtri o un'altra pagina. */
  function resultsHref(nextFilters: ResultFilters, nextPage: number): string {
    const query = new URLSearchParams(searchParams?.toString() ?? "");
    for (const name of Object.values(RESULT_FILTER_PARAMS)) query.delete(name);
    // La specializzazione della pagina per servizio sta nel percorso, non nell'indirizzo.
    const { subTag: _pageSubTag, ...urlFilters } = nextFilters;
    for (const [name, value] of resultFilterEntries(urlFilters)) query.set(name, value);
    if (nextPage > 1) query.set(RESULT_FILTER_PARAMS.page, String(nextPage));
    const text = query.toString();
    return `${pathname}${text ? `?${text}` : ""}`;
  }

  // Chiudendo il pannello valgono i filtri toccati: la pagina riparte dalla prima.
  function closeFilters() {
    setShowFilters(false);
    if (!sameFilters(draft, filters)) router.push(resultsHref(draft, 1), { scroll: false });
  }

  // Popup centrato (richiesta esplicita dell'utente), stesso pattern
  // overlay già in uso altrove nel prodotto (BookingDetailPanel,
  // ClientProfileModal, SlotEditorModal): role="dialog", chiusura con
  // Escape o click sul backdrop.
  useEffect(() => {
    if (!showFilters) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") closeFilters();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  });

  // "Ordinato per pertinenza" cliccabile (richiesta esplicita dell'utente):
  // un piccolo popup spiega il criterio reale di ordinamento invece di
  // restare solo un'etichetta passiva (Verbale Cognitivo F1.3).
  const [showSortInfo, setShowSortInfo] = useState(false);
  useEffect(() => {
    if (!showSortInfo) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setShowSortInfo(false);
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [showSortInfo]);

  // Solo le lingue effettivamente parlate tra i professionisti trovati
  // (richiesta esplicita dell'utente, dall'API su tutti i trovati), filtrate
  // dal testo digitato.
  const availableLanguages = useMemo(() => {
    const query = languageQuery.trim().toLowerCase();
    return query ? page.languages.filter((lang) => lang.toLowerCase().includes(query)) : page.languages;
  }, [page.languages, languageQuery]);

  const activeFilterCount = activeResultFilterCount(filters);

  // Riaprendo i filtri con "Accetta pagamenti online" acceso, la sezione
  // "Pagamento" è già aperta: si vede subito che il filtro è attivo (Luca,
  // docs/changelog/2026-11-06-filtro-pagamenti-online.md).
  function toggleFilters() {
    if (showFilters) {
      closeFilters();
      return;
    }
    if (filters.onlinePayment) setExpandedSection("payment");
    setDraft(filters);
    setShowFilters(true);
  }

  function toggleSection(section: "online" | "availability" | "language" | "insurance" | "payment") {
    setExpandedSection((prev) => (prev === section ? null : section));
  }

  // Cambiando pagina della zona della mappa la lista torna in cima.
  function goToAreaPage(number: number) {
    setAreaPageNumber(number);
    listTopRef.current?.scrollIntoView({ block: "start" });
  }

  // Puntini: tutti i trovati quando sono arrivati, altrimenti le schede della pagina.
  // Le schede della pagina hanno già l'agenda per l'anteprima.
  const shownById = new Map(shown.results.map((pro) => [pro.id, pro]));
  const mapProfessionals: MapProfessional[] = pins ? pins.map((pin) => shownById.get(pin.id) ?? pin) : shown.results;
  const loadMapAvailability = useMemo(
    () =>
      async (id: string): Promise<MapAvailability> => {
        const agenda = await apiClient.getProfessionalAgenda(id);
        return { from: agenda.days[0]?.date ?? new Date().toISOString().slice(0, 10), days: agendaToPreviewDays(agenda) };
      },
    [],
  );


  // Richiesta di preventivo già con giorno, orario e modalità: dalla scheda
  // e dall'anteprima sulla mappa (docs/changelog/2026-11-05-anteprima-mappa.md).
  const slotHref = (pro: LinkablePro, date: string, time: string, endTime: string, mode: "HOME" | "ONLINE") =>
    `/preventivo?categoria=${pro.categorySlug}&professionista=${pro.id}&nomeProfessionista=${encodeURIComponent(pro.businessName)}&fotoProfessionista=${encodeURIComponent(pro.imageUrl ?? "")}&data=${date}&fasciaOraria=${time}-${endTime}&modalita=${mode}${serviceDescriptionParam(pro, problemDescription)}&da=${PROFILE_REQUEST_SOURCE_PARAM.RICERCA}`;
  // Profilo, eventualmente aperto sull'agenda di un giorno (anteprima sulla mappa).
  const mapProfileHref = (pro: LinkablePro, date?: string) =>
    `${profileHref(pro, { ...fromChoice, ...(date ? { data: date } : {}), ...(defaultMode === "ONLINE" ? { modalita: "ONLINE" } : {}) }, problemDescription)}${date ? "#agenda" : ""}`;

  // Cuoricino "Salva" sulla foto dell'anteprima della mappa, come nelle schede.
  const renderMapSave = (pro: MapProfessional) =>
    canSave ? (
      <IconActionButton
        label={savedIds.has(pro.id) ? "Salvato" : "Salva"}
        active={savedIds.has(pro.id)}
        disabled={pendingId === pro.id}
        size={24}
        celebrate
        onPress={() => void toggleSave(pro.id)}
      >
        <Icon
          name="heart"
          size={12}
          strokeWidth={2}
          color={savedIds.has(pro.id) ? "white" : brand.grafite}
          fill={savedIds.has(pro.id) ? "white" : "none"}
        />
      </IconActionButton>
    ) : null;

  // Una scheda dei risultati: la stessa per la sezione "Potrebbero fare
  // anche questo lavoro" (scelta di Luca), lì senza "Scegli", perché le
  // richieste a più professionisti restano del mestiere cercato.
  const renderCard = (pro: ProfessionalSearchResult, index: number, other = false) => (
    <ProfessionalCard
      key={pro.id}
      // Orari e prezzi aperti solo nella prima scheda (docs/CHANGELOG.md §349).
      defaultExpanded={!other && index === 0}
      reason={reasonFor?.(pro)}
      action={selection && !other ? <ChooseToggle pro={pro} selection={selection} /> : undefined}
      businessName={pro.businessName}
      categoryLabel={pro.categoryLabel}
      otherCategoryLabels={pro.categories?.filter((category) => category.slug !== pro.categorySlug).map((category) => category.label)}
      city={pro.city}
      distanceKm={pro.distanceKm}
      subTags={pro.subTags.map(subTagLabel)}
      rating={pro.rating ?? undefined}
      reviewCount={pro.reviewCount}
      completedThisMonth={pro.completedThisMonth}
      verified={pro.verified}
      stripeVerified={pro.stripeVerified}
      professionalKind={pro.professionalKind}
      boosted={merit ? false : pro.boosted}
      isNewProfile={pro.isNewProfile}
      hasLiabilityInsurance={pro.hasLiabilityInsurance}
      remoteAvailable={pro.remoteAvailable}
      services={pro.services}
      highlightServiceId={pro.matchedServiceId}
      priceFromFirst={pro.categoryServiceCount}
      availabilityPreview={pro.availabilityPreview}
      availabilityFrom={pro.availabilityFrom}
      availabilityDays={PUBLIC_AGENDA_DAYS}
      // Agenda leggera: oltre la prima settimana la scheda chiede quella del
      // profilo, una volta sola (docs/changelog/2026-11-16-traffico-elevato.md).
      availabilityCompleteUntil={pro.availabilityCompleteUntil}
      loadFullAvailability={() => apiClient.getProfessionalAgenda(pro.id).then(agendaToPreviewDays)}
      defaultMode={defaultMode}
      // Se la ricerca è in modalità "Online", il profilo si apre già
      // con l'agenda su quel tab (richiesta esplicita dell'utente) —
      // letto da ProfessionalDetailContent via `?modalita=`, stesso
      // parametro già usato per precompilare /preventivo.
      href={profileHref(pro, { ...fromChoice, ...(defaultMode === "ONLINE" ? { modalita: "ONLINE" } : {}) }, problemDescription)}
      onPress={() => {
        const href = profileHref(pro, { ...fromChoice, ...(defaultMode === "ONLINE" ? { modalita: "ONLINE" } : {}) }, problemDescription);
        navigateWithTransition(() => router.push(href), href);
      }}
      // Click su un orario libero della mini-agenda (o sul bottone
      // "Mostra orari disponibili", che qui atterra sempre su una
      // fascia reale — vedi ProfessionalCard: quel bottone ora avanza
      // solo la finestra locale della card, il click successivo sulla
      // fascia arriva comunque qui) — richiesta esplicita dell'utente:
      // porta direttamente alla richiesta di preventivo con
      // data/orario/modalità già precompilati, stesso URL già usato
      // dall'agenda della pagina profilo pubblica
      // (ProfessionalDetailContent), non solo un'ancora verso di essa.
      onSlotPress={(date, time, endTime, mode) =>
        navigateWithTransition(() =>
          router.push(
            // `nomeProfessionista`/`fotoProfessionista` (richiesta
            // esplicita dell'utente: il cliente deve capire subito
            // che la richiesta va a QUEL professionista, non "ai
            // professionisti compatibili nella zona") — già
            // disponibili qui sui risultati di ricerca, passati via
            // query string invece di un fetch aggiuntivo in
            // GuidedRequestForm. Nomi distinti da "nome"/"foto" per
            // non collidere con il "nome" del CLIENTE (prefill di
            // "Ripeti la richiesta", stesso form).
            slotHref(pro, date, time, endTime, mode),
          ),
          slotHref(pro, date, time, endTime, mode),
        )
      }
      // Click sull'agenda fuori da un orario libero: profilo aperto
      // sull'agenda, già sul giorno scelto e sulla stessa modalità
      // (richiesta esplicita dell'utente, docs/CHANGELOG.md §206).
      onAgendaPress={(date, mode) => {
        const href = `${profileHref(pro, { ...fromChoice, data: date, ...(mode === "ONLINE" ? { modalita: "ONLINE" } : {}) }, problemDescription)}#agenda`;
        navigateWithTransition(() => router.push(href), href);
      }}
      // Cuoricino piccolo nell'angolo della foto (richiesta esplicita
      // dell'utente, docs/CHANGELOG.md §208): accanto al nome rubava
      // spazio al nome sui telefoni.
      icon={
        <span style={{ position: "relative", display: "inline-flex", flexShrink: 0 }}>
          <ProfessionalAvatar
            imageUrl={pro.imageUrl}
            categorySlug={pro.categorySlug}
            size={CARD_PHOTO.size}
            mobileSize={CARD_PHOTO.mobileSize}
            shape={CARD_PHOTO.shape}
            priority={index === 0}
            name={pro.businessName}
          />
          {canSave ? (
            // Il clic sul cuoricino non deve aprire anche il profilo (clic sulla card).
            // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
            <span style={{ position: "absolute", ...heartOffset }} onClick={(e) => e.stopPropagation()}>
              <IconActionButton
                label={savedIds.has(pro.id) ? "Salvato" : "Salva"}
                active={savedIds.has(pro.id)}
                disabled={pendingId === pro.id}
                size={24}
                celebrate
                onPress={() => void toggleSave(pro.id)}
              >
                <Icon
                  name="heart"
                  size={12}
                  strokeWidth={2}
                  color={savedIds.has(pro.id) ? "white" : brand.grafite}
                  fill={savedIds.has(pro.id) ? "white" : "none"}
                />
              </IconActionButton>
            </span>
          ) : null}
        </span>
      }
    />
  );

  return (
    // Layout con classi CSS grezze (styled-jsx, incluso in Next.js) invece dei
    // props responsive di Tamagui: qui serve sia riordinare le due colonne
    // (mappa sopra la lista su schermi stretti, mappa a destra altrimenti)
    // sia rendere la mappa sticky e sempre aperta SOLO sopra la soglia — cose
    // che i props Tamagui non esprimono direttamente (niente `order`,
    // `position:"sticky"` non tipizzato). Soglia a 700px (non lo `$gtMd` di
    // Tamagui, 1021px): quella era pensata per nascondere la mappa del tutto
    // sotto una certa larghezza, ma con l'affiancamento a colonne una finestra
    // desktop "normale" (~1000px, non a schermo intero) ricadeva comunque
    // sotto i 1021px e mostrava il layout impilato da mobile — sbagliato, non
    // era uno schermo stretto. 700px isola davvero solo i telefoni.
    <div className="results-layout">
      {showFilters ? (
        <div className="filters-backdrop" role="presentation" onClick={closeOnBackdrop(closeFilters)}>
          <div className="filters-modal" role="dialog" aria-modal="true" aria-label="Filtri">
            <div className="filters-modal-header">
              <span className="filters-modal-title">Filtri</span>
              <button type="button" className="filters-modal-close" onClick={closeFilters} aria-label="Chiudi">
                <X size={18} strokeWidth={1.5} />
              </button>
            </div>

            <div className="filters-modal-body">
              {/* Sezione ad accordion (richiesta esplicita dell'utente,
                  riferimento miodottore.it): titolo cliccabile con
                  chevron, il contenuto compare solo da espansa. */}
              <div className="filters-section">
                <button type="button" className="filters-section-header" onClick={() => toggleSection("online")}>
                  <span className="filters-section-title">Consulenza online</span>
                  {expandedSection === "online" ? <ChevronUp size={18} strokeWidth={1.5} /> : <ChevronDown size={18} strokeWidth={1.5} />}
                </button>
                {expandedSection === "online" ? (
                  <div className="filters-section-content">
                    <div className="filters-toggle-row">
                      <span id="filter-online-label">Mostra tutti i professionisti che offrono consulenza online</span>
                      <span
                        className={`filters-switch${filterOnlineOnly ? " on" : ""}`}
                        onClick={setFilterOnlineOnly}
                        role="switch"
                        aria-labelledby="filter-online-label"
                        aria-checked={filterOnlineOnly}
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setFilterOnlineOnly();
                          }
                        }}
                      >
                        <span className="filters-switch-knob" />
                      </span>
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="filters-section">
                <button type="button" className="filters-section-header" onClick={() => toggleSection("availability")}>
                  <span className="filters-section-title">Date disponibili</span>
                  {expandedSection === "availability" ? (
                    <ChevronUp size={18} strokeWidth={1.5} />
                  ) : (
                    <ChevronDown size={18} strokeWidth={1.5} />
                  )}
                </button>
                {expandedSection === "availability" ? (
                  <div className="filters-section-content">
                    {/* Preimpostato dal toggle "Intervento urgente?" della
                        homepage (?urgente=1) — resta regolabile qui, non più
                        un controllo a sé sempre visibile sopra i risultati. */}
                    <div className="filters-toggle-row">
                      <span id="filter-urgent-label">
                        <Zap size={14} strokeWidth={1.5} color={brand.urgenza} style={{ verticalAlign: "-2px", marginRight: 6 }} />
                        Intervento urgente: solo disponibili nelle prossime 24h
                      </span>
                      <span
                        className={`filters-switch${filterUrgentOnly ? " on" : ""}`}
                        onClick={setFilterUrgentOnly}
                        role="switch"
                        aria-labelledby="filter-urgent-label"
                        aria-checked={filterUrgentOnly}
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setFilterUrgentOnly();
                          }
                        }}
                      >
                        <span className="filters-switch-knob" />
                      </span>
                    </div>
                    <div className="filters-pill-row">
                      {(
                        [
                          { value: "any", label: "Qualsiasi giorno" },
                          { value: "today", label: "Oggi" },
                          { value: "3days", label: "Entro 3 giorni" },
                        ] as const
                      ).map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          className={`filters-pill${filterAvailability === opt.value ? " active" : ""}`}
                          onClick={() => setFilterAvailability(opt.value)}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="filters-section">
                <button type="button" className="filters-section-header" onClick={() => toggleSection("insurance")}>
                  <span className="filters-section-title">Assicurazione</span>
                  {expandedSection === "insurance" ? <ChevronUp size={18} strokeWidth={1.5} /> : <ChevronDown size={18} strokeWidth={1.5} />}
                </button>
                {expandedSection === "insurance" ? (
                  <div className="filters-section-content">
                    <div className="filters-toggle-row">
                      <span id="filter-insured-label">
                        <ShieldCheck size={14} strokeWidth={1.5} style={{ verticalAlign: "-2px", marginRight: 6 }} />
                        Solo con assicurazione RC professionale
                      </span>
                      <span
                        className={`filters-switch${filterInsuredOnly ? " on" : ""}`}
                        onClick={setFilterInsuredOnly}
                        role="switch"
                        aria-labelledby="filter-insured-label"
                        aria-checked={filterInsuredOnly}
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setFilterInsuredOnly();
                          }
                        }}
                      >
                        <span className="filters-switch-knob" />
                      </span>
                    </div>
                    <span className="filters-empty">Dichiarata dal professionista, non ancora verificata da noi.</span>
                  </div>
                ) : null}
              </div>

              <div className="filters-section">
                <button type="button" className="filters-section-header" onClick={() => toggleSection("payment")}>
                  <span className="filters-section-title">Pagamento</span>
                  {expandedSection === "payment" ? <ChevronUp size={18} strokeWidth={1.5} /> : <ChevronDown size={18} strokeWidth={1.5} />}
                </button>
                {expandedSection === "payment" ? (
                  <div className="filters-section-content">
                    <div className="filters-toggle-row">
                      <span id="filter-online-payment-label">
                        <CreditCard size={14} strokeWidth={1.5} style={{ verticalAlign: "-2px", marginRight: 6 }} />
                        Accetta pagamenti online
                      </span>
                      <span
                        className={`filters-switch${filterOnlinePaymentOnly ? " on" : ""}`}
                        onClick={setFilterOnlinePaymentOnly}
                        role="switch"
                        aria-labelledby="filter-online-payment-label"
                        aria-checked={filterOnlinePaymentOnly}
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setFilterOnlinePaymentOnly();
                          }
                        }}
                      >
                        <span className="filters-switch-knob" />
                      </span>
                    </div>
                    <span className="filters-empty">Paghi con carta sul sito: se qualcosa va storto ti assistiamo noi.</span>
                  </div>
                ) : null}
              </div>

              <div className="filters-section">
                <button type="button" className="filters-section-header" onClick={() => toggleSection("language")}>
                  <span className="filters-section-title">Lingua parlata</span>
                  {expandedSection === "language" ? <ChevronUp size={18} strokeWidth={1.5} /> : <ChevronDown size={18} strokeWidth={1.5} />}
                </button>
                {expandedSection === "language" ? (
                  <div className="filters-section-content">
                    <input aria-label="Cerca una lingua"
                      type="text"
                      className="filters-text-input"
                      value={languageQuery}
                      onChange={(e) => setLanguageQuery(e.target.value)}
                      placeholder="Cerca una lingua..."
                    />
                    <div className="filters-pill-row">
                      {selectedLanguage ? (
                        <button type="button" className="filters-pill active" onClick={() => setSelectedLanguage(null)}>
                          {selectedLanguage} ✕
                        </button>
                      ) : (
                        availableLanguages.map((lang) => (
                          <button key={lang} type="button" className="filters-pill" onClick={() => setSelectedLanguage(lang)}>
                            {lang}
                          </button>
                        ))
                      )}
                      {!selectedLanguage && availableLanguages.length === 0 ? (
                        <span className="filters-empty">Nessuna lingua trovata tra i professionisti in questi risultati.</span>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="filters-modal-footer">
              {activeResultFilterCount(draft) > 0 ? (
                <button
                  type="button"
                  className="filters-reset"
                  onClick={() => {
                    setLanguageQuery("");
                    // La specializzazione della pagina per servizio non è un filtro del pannello.
                    setDraft(filters.subTag ? { subTag: filters.subTag } : {});
                  }}
                >
                  Reimposta filtri
                </button>
              ) : null}
              <button type="button" className="filters-apply" onClick={closeFilters}>
                {filteredResultsCount === null
                  ? "Mostra i risultati"
                  : `Mostra ${filteredResultsCount} risultat${filteredResultsCount === 1 ? "o" : "i"}`}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showSortInfo ? (
        <div
          role="presentation"
          onClick={closeOnBackdrop(() => setShowSortInfo(false))}
          className="filters-backdrop"
        >
          <div className="sort-info-modal" role="dialog" aria-modal="true" aria-label="Come sono ordinati i risultati">
            <div className="filters-modal-header">
              <span className="filters-modal-title">Come è ordinato l&apos;elenco</span>
              <button type="button" className="filters-modal-close" onClick={() => setShowSortInfo(false)} aria-label="Chiudi">
                <X size={18} strokeWidth={1.5} />
              </button>
            </div>
            <div className="sort-info-body">
              {/* Testo allineato all'ordinamento reale di ProfessionalsService.search
                  (docs/CHANGELOG.md §170; verifica dell'identità e prestazione dal
                  problema aggiunte dal controllo pre-lancio 08/11, E4-02): i parametri principali e il peso
                  dei pagamenti vanno dichiarati (Codice del Consumo art. 22,
                  Reg. UE 2019/1150 art. 5). Se cambia l'ordinamento, cambia
                  anche questo testo. */}
              <p>
                {merit
                  ? "Partendo dal problema che hai descritto, i pacchetti di visibilità a pagamento non contano. I risultati sono ordinati così:"
                  : "I risultati sono ordinati sempre nello stesso modo:"}
              </p>
              <ol>
                {merit ? (
                  <>
                    <li>prima chi indica tra i suoi servizi proprio il lavoro che serve per il tuo problema;</li>
                    <li>poi la valutazione media più alta;</li>
                  </>
                ) : (
                  <>
                    <li>
                      prima i professionisti che hanno pagato un pacchetto di visibilità: sono segnati con l&apos;etichetta
                      &quot;Sponsorizzato&quot;;
                    </li>
                    <li>poi, a parità di posizione, la valutazione media più alta;</li>
                  </>
                )}
                <li>a parità di valutazione, il numero di recensioni ricevute;</li>
                <li>se hai cercato un luogo, a parità di tutto il più vicino.</li>
              </ol>
              <p>
                Chi non ha ancora completato la verifica dell&apos;identità compare dopo chi l&apos;ha completata, perché non può ancora
                mandarti un preventivo. Un professionista con più segnalazioni accolte in 30 giorni scende in fondo all&apos;elenco per 14
                giorni, anche se ha pagato per essere in evidenza. Valutazioni e recensioni non si possono comprare: arrivano solo da
                lavori prenotati sul sito.
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {showMap ? (
        <div
          className={`results-map-col${mobileMapOpen ? " mobile-open" : ""}${mapExpanded ? " expanded" : ""}`}
          {...(phoneMapOpen ? { role: "dialog", "aria-modal": true, "aria-label": "Mappa dei professionisti" } : {})}
        >
          <div className="results-map-sticky">
            {phoneMapOpen ? (
              <>
                <div className="map-top-bar">
                  {areaMoved ? (
                    <button
                      type="button"
                      className="map-search-area"
                      onClick={() => {
                        setAreaBounds(liveBounds);
                        setAreaSweep((n) => n + 1);
                      }}
                    >
                      <RotateCw size={16} strokeWidth={2} aria-hidden />
                      Cerca in quest&apos;area
                    </button>
                  ) : areaBounds ? (
                    <span className="map-search-area map-area-count" role="status">
                      {areaLoading
                        ? "Cerco in quest'area…"
                        : shown.total === 0
                          ? "Nessun professionista qui"
                          : `${shown.total} professionist${shown.total === 1 ? "a" : "i"} qui`}
                    </span>
                  ) : null}
                </div>
                {areaSweep > 0 ? <div key={areaSweep} className="flow-bar flow-bar-once map-area-sweep" aria-hidden="true" /> : null}
                <button type="button" ref={mapCloseRef} className="map-fullscreen-close" onClick={closePhoneMap} aria-label="Chiudi la mappa">
                  <X size={22} strokeWidth={2} aria-hidden />
                </button>
              </>
            ) : null}
            <button type="button" className="map-expand-toggle hover-ring" onClick={() => setMapExpanded((v) => !v)}>
              {mapExpanded ? <Minimize2 size={14} strokeWidth={1.5} /> : <Maximize2 size={14} strokeWidth={1.5} />}
              {mapExpanded ? "Riduci mappa" : "Espandi mappa"}
            </button>
            <YStack
              width="100%"
              height="100%"
              borderRadius={phoneMapOpen ? 0 : "4"}
              overflow="hidden"
              borderWidth={phoneMapOpen ? 0 : 1}
              borderColor={brand.filetto}
            >
              {shouldMountMap ? (
                <ResultsMap
                  professionals={mapProfessionals}
                  initialProfessionals={page.results}
                  loadAvailability={loadMapAvailability}
                  fallbackCenter={fallbackCenter}
                  onBoundsChange={handleBoundsChange}
                  fullScreen={!wideScreen}
                  mode={defaultMode ?? "HOME"}
                  slotHref={slotHref}
                  profileHref={mapProfileHref}
                  renderSave={renderMapSave}
                  onSelectedChange={setMapSelectedId}
                />
              ) : null}
            </YStack>
          </div>
        </div>
      ) : null}

      <div className="results-list-col">
        <YStack gap="3">
          {/* Il bottone filtri vive DENTRO la colonna lista (sopra
              l'intestazione), non come figlio diretto del layout a righe:
              su desktop (>=700px) il contenitore e' un flex orizzontale, e
              un bottone full-width li' diventava una terza "colonna"
              schiacciata che sfalsava lista e mappa (bug segnalato
              dall'utente). */}
          {/* Tolte le tre righe di fiducia sopra i risultati (docs/CHANGELOG.md
              §349): sono già nel piè di pagina e da telefono spingevano i
              risultati sotto il primo schermo. */}
          {/* Senza nessun risultato Filtri, Mappa e ordinamento non servono:
              resta solo il riquadro per inviare lo stesso la richiesta
              (docs/CHANGELOG.md §271). */}
          {/* Con dei filtri accesi la riga resta, anche senza risultati: si
              devono poter togliere. */}
          {page.total === 0 && activeFilterCount === 0 ? null : (
          <XStack alignItems="center" justifyContent="space-between" flexWrap="wrap" gap="2">
            <XStack alignItems="center" gap="2" flexWrap="wrap">
              <button type="button" className="filters-toggle hover-ring" onClick={toggleFilters}>
                <SlidersHorizontal size={16} strokeWidth={1.5} />
                Filtri{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
              </button>
              {/* "Mappa"/"Nascondi mappa" sulla stessa riga di "Filtri"
                  (richiesta esplicita dell'utente: "metti sulla stessa riga
                  prima il tasto 'filtri' e poi 'mostra mappa'"), solo
                  mobile — nascosto da 700px in su via CSS (`.filters-toggle`
                  stessa classe, la mappa è già sempre visibile a fianco
                  della lista da desktop). Etichetta da chiusa rinominata in
                  "Mappa" (richiesta esplicita), quella da aperta invariata. */}
              {/* Apre la mappa a schermo intero, che si chiude con la sua X
                  (docs/changelog/2026-11-04-mappa-schermo-intero.md). */}
              {showMap ? (
                <button
                  type="button"
                  ref={mapToggleRef}
                  className="filters-toggle mobile-map-toggle hover-ring"
                  aria-haspopup="dialog"
                  onClick={() => setMobileMapOpen(true)}
                >
                  <MapIcon size={16} strokeWidth={1.5} aria-hidden />
                  Mappa
                </button>
              ) : null}
            </XStack>
            {/* Etichetta di ordinamento (Verbale Cognitivo F1.3) resa
                cliccabile (richiesta esplicita dell'utente): apre un popup
                che spiega il criterio reale, invece di restare solo
                un'etichetta passiva — stesso ordinamento di default,
                invariato (boost pagato → valutazione → recensioni). */}
            {/* Con l'icona "info" e senza la sottolineatura tratteggiata, che
                lo faceva sembrare un link spento (docs/CHANGELOG.md §349): apre
                la spiegazione dell'ordine, non un elenco di ordinamenti. */}
            <button type="button" className="sort-info-trigger" onClick={() => setShowSortInfo(true)}>
              {/* Prima "Ordinato per pertinenza": parola difficile (prova con persone simulate, docs/changelog/2026-11-08-prova-persone-simulate.md). */}
              Come è ordinato l&apos;elenco
              <Info size={15} strokeWidth={1.75} aria-hidden />
            </button>
          </XStack>
          )}
          {header}
          {page.nearestOutsideKm !== null ? (
            <YStack backgroundColor={brand.calce} borderWidth={1} borderColor={brand.filetto} borderRadius="4" padding="3">
              <Text color={brand.grafite} fontSize={16}>
                Nessun professionista entro {SEARCH_RADIUS_KM} km da {city}: ti mostriamo il più
                vicino, a circa {page.nearestOutsideKm} km.
              </Text>
            </YStack>
          ) : null}
          {/* Da telefono, dopo "Cerca in quest'area": la lista mostra solo la
              zona cercata, e si torna a tutti i risultati con un tocco. */}
          {showMap && !wideScreen && areaBounds ? (
            <div className="map-area-notice">
              <span>
                {!areaLoading && shown.total === 0 ? "Nessuno nella zona cercata sulla mappa." : "Solo la zona cercata sulla mappa."}
              </span>
              <button type="button" className="map-area-reset" onClick={() => setAreaBounds(null)}>
                Mostra tutti
              </button>
            </div>
          ) : null}
          {/* Filtri accesi e nessuno che li rispetta: lo diciamo, con il modo di toglierli. */}
          {page.total > 0 || activeFilterCount === 0 || bounds ? null : (
            <div className="map-area-notice results-filters-empty" role="status">
              <span>Nessun professionista con questi filtri.</span>
              <Link href={resultsHref(filters.subTag ? { subTag: filters.subTag } : {}, 1)} scroll={false}>
                Togli i filtri
              </Link>
            </div>
          )}
          <div ref={listTopRef} className={`results-cards${areaLoading ? " refreshing" : ""}`} aria-busy={areaLoading}>
            {shown.results.map((pro, index) => (
              <div key={pro.id} className={`results-card${wideScreen && mapSelectedId === pro.id ? " map-selected" : ""}`}>
                {renderCard(pro, index)}
              </div>
            ))}
          </div>
          {/* Pagine numerate (scelta di Luca, docs/changelog/2026-11-16-pagine-da-20.md):
              link veri per la ricerca, pulsanti per la zona della mappa. */}
          {shown.pageCount > 1 ? (
            <ResultsPager
              page={shown.page}
              pageCount={shown.pageCount}
              total={shown.total}
              pageSize={shown.pageSize}
              {...(bounds ? { onPage: goToAreaPage } : { hrefFor: (number: number) => resultsHref(filters, number) })}
            />
          ) : null}
          {otherSection && otherSection.professionals.length > 0 ? (
            <section id="anche-questo-lavoro" aria-labelledby="results-other-section" className="results-other-section">
              <YStack gap="1" marginBottom="2">
                <Text id="results-other-section" render="h2" fontFamily="heading" fontWeight="800" fontSize={20} color={brand.inchiostro}>
                  {otherSection.title}
                </Text>
                <Text fontSize={14} color={brand.grafite70}>
                  {otherSection.subtitle}
                </Text>
              </YStack>
              <YStack gap="3">{otherSection.professionals.map((pro, index) => renderCard(pro, index, true))}</YStack>
            </section>
          ) : null}
          {nextTradeSection && nextTradeSection.professionals.length > 0 && shown.page >= shown.pageCount && !bounds ? (
            <section id="altro-mestiere" aria-labelledby="results-next-trade" className="results-other-section">
              <YStack gap="1" marginBottom="2">
                <Text id="results-next-trade" render="h2" fontFamily="heading" fontWeight="800" fontSize={20} color={brand.inchiostro}>
                  {nextTradeSection.title}
                </Text>
                <Text fontSize={14} color={brand.grafite70}>
                  {nextTradeSection.subtitle}
                </Text>
              </YStack>
              <YStack gap="3">{nextTradeSection.professionals.map((pro, index) => renderCard(pro, index, true))}</YStack>
              {nextTradeSection.moreHref && nextTradeSection.moreLabel ? (
                <Link href={nextTradeSection.moreHref} className="results-next-trade-more">
                  {nextTradeSection.moreLabel}
                </Link>
              ) : null}
            </section>
          ) : null}
          {footer ? <div className="results-list-footer">{footer}</div> : null}
        </YStack>
      </div>

      <style jsx>{`
        .results-next-trade-more {
          display: inline-flex;
          align-self: flex-start;
          margin-top: var(--t-space-3, 12px);
          min-height: 44px;
          align-items: center;
          font-weight: 600;
          color: ${brand.cianografiaScuro};
        }
        .results-cards {
          display: flex;
          flex-direction: column;
          gap: var(--t-space-3, 12px);
          scroll-margin-top: 96px;
          transition: opacity 0.15s ease;
        }
        .results-cards.refreshing {
          opacity: 0.55;
        }
        .results-filters-empty :global(a) {
          display: inline-flex;
          align-items: center;
          min-height: 40px;
          padding: 0 4px;
          color: ${brand.cianografiaScuro};
          font-weight: 700;
          text-decoration: underline;
          text-underline-offset: 3px;
        }
        .results-layout {
          display: flex;
          flex-direction: column;
          gap: 16px;
          width: 100%;
        }
        .mobile-map-toggle,
        .filters-toggle {
          width: auto;
          padding: 10px 16px;
          border-radius: 999px;
          border: 1px solid ${brand.filetto};
          background: ${brand.calce};
          color: ${brand.grafite};
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
        }
        .sort-info-trigger {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          min-height: 40px;
          background: none;
          border: none;
          padding: 0 4px;
          font-size: 14px;
          font-weight: 600;
          color: ${brand.grafite70};
          cursor: pointer;
        }
        .sort-info-trigger:hover {
          color: ${brand.grafite};
        }
        @media (min-width: 700px) {
          /* Desktop: il bottone sta in cima alla colonna lista (e' spostato
              li' nel markup) e non deve occupare tutta la larghezza —
              pillola compatta allineata a sinistra, coerente col riferimento
              miodottore.it. */
          .filters-toggle {
            width: auto;
            align-self: flex-start;
            justify-content: flex-start;
            padding: 10px 18px;
            border-radius: 999px;
          }
        }
        .filters-backdrop {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(20, 24, 30, 0.55);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          padding: 16px;
        }
        .sort-info-modal {
          width: 100%;
          max-width: 380px;
          max-height: calc(100vh - 32px);
          border-radius: 8px;
          border: 1px solid ${brand.filetto};
          background: ${brand.calce};
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
        .sort-info-body {
          padding: 16px 20px 20px;
          font-size: 14px;
          line-height: 1.5;
          color: ${brand.grafite};
          overflow-y: auto;
        }
        .sort-info-body ol {
          margin: 8px 0;
          padding-left: 20px;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .filters-modal {
          width: 100%;
          max-width: 420px;
          max-height: calc(100vh - 32px);
          border-radius: 8px;
          border: 1px solid ${brand.filetto};
          background: ${brand.calce};
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
        .filters-modal-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px 20px;
          border-bottom: 1px solid ${brand.filetto};
          flex-shrink: 0;
        }
        .filters-modal-title {
          font-size: 18px;
          font-weight: 800;
          color: ${brand.grafite};
        }
        .filters-modal-close {
          border: none;
          background: transparent;
          color: ${brand.grafite70};
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 4px;
        }
        .filters-modal-body {
          padding: 0 20px;
          display: flex;
          flex-direction: column;
          overflow-y: auto;
        }
        .filters-modal-footer {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 10px;
          padding: 16px 20px;
          border-top: 1px solid ${brand.filetto};
          flex-shrink: 0;
        }
        .filters-reset {
          border: none;
          background: transparent;
          color: ${brand.grafite70};
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          text-decoration: underline;
        }
        .filters-apply {
          width: 100%;
          padding: 14px 20px;
          border-radius: 999px;
          border: none;
          background: ${brand.cianografiaPieno};
          color: #ffffff;
          font-size: 15px;
          font-weight: 700;
          cursor: pointer;
        }
        .filters-section {
          border-bottom: 1px solid ${brand.filetto};
        }
        .filters-section:last-child {
          border-bottom: none;
        }
        .filters-section-header {
          width: 100%;
          padding: 18px 0;
          border: none;
          background: transparent;
          display: flex;
          align-items: center;
          justify-content: space-between;
          cursor: pointer;
          color: ${brand.grafite70};
        }
        .filters-section-title {
          font-size: 15px;
          font-weight: 700;
          color: ${brand.grafite};
        }
        .filters-section-content {
          display: flex;
          flex-direction: column;
          gap: 12px;
          padding-bottom: 18px;
        }
        .filters-toggle-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          font-size: 14px;
          color: ${brand.grafite};
          cursor: pointer;
        }
        .filters-switch {
          flex-shrink: 0;
          width: 44px;
          height: 26px;
          border-radius: 999px;
          background: ${brand.filetto};
          position: relative;
          cursor: pointer;
          transition: background 150ms ease;
        }
        .filters-switch.on {
          background: ${brand.cianografiaPieno};
        }
        .filters-switch-knob {
          position: absolute;
          top: 3px;
          left: 3px;
          width: 20px;
          height: 20px;
          border-radius: 999px;
          background: #ffffff;
          transition: transform 150ms ease;
        }
        .filters-switch.on .filters-switch-knob {
          transform: translateX(18px);
        }
        .filters-pill-row {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }
        .filters-pill {
          padding: 6px 12px;
          border-radius: 999px;
          border: 1px solid ${brand.filetto};
          background: ${brand.gesso};
          color: ${brand.grafite};
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
        }
        .filters-pill.active {
          background: ${brand.cianografiaPieno};
          border-color: ${brand.cianografia};
          color: #ffffff;
        }
        .filters-text-input {
          padding: 10px 12px;
          border-radius: 4px;
          border: 1px solid ${brand.filetto};
          background: ${brand.calce};
          color: ${brand.grafite};
          font-size: 14px;
          font-family: inherit;
        }
        .filters-empty {
          font-size: 13px;
          color: ${brand.grafite70};
        }
        /* Scheda del professionista aperto sulla mappa: solo un bordo verde
           sottile, la pagina non si sposta (richiesta di Luca: "in modo leggero"). */
        .results-card {
          border-radius: 20px;
          transition: box-shadow 160ms ease-out;
        }
        .results-card.map-selected {
          box-shadow: 0 0 0 2px ${brand.cianografia};
        }
        @media (prefers-reduced-motion: reduce) {
          .results-card {
            transition: none;
          }
        }
        .results-map-col {
          display: none;
          width: 100%;
          flex-shrink: 0;
        }
        /* Da telefono la mappa copre tutto lo schermo, sopra l'intestazione
           del sito e la barra dei professionisti scelti
           (docs/changelog/2026-11-04-mappa-schermo-intero.md). */
        .results-map-col.mobile-open {
          display: flex;
          position: fixed;
          inset: 0;
          z-index: 1500;
          background: ${brand.calce};
        }
        .results-map-sticky {
          width: 100%;
          height: 100vh;
          height: 100dvh;
          position: relative;
        }
        /* Al centro, lasciando a destra lo spazio della X (e altrettanto a
           sinistra, perché resti centrato come su miodottore.it). */
        .map-top-bar {
          position: absolute;
          top: calc(env(safe-area-inset-top, 0px) + 14px);
          left: 70px;
          right: 70px;
          z-index: 600;
          display: flex;
          justify-content: center;
          pointer-events: none;
        }
        .map-area-sweep {
          position: absolute;
          top: env(safe-area-inset-top, 0px);
          left: 0;
          right: 0;
          z-index: 601;
          height: 3px;
          border-radius: 0;
          pointer-events: none;
        }
        .map-search-area {
          pointer-events: auto;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          min-height: 44px;
          padding: 10px 20px;
          border-radius: 999px;
          border: none;
          background: ${brand.cianografiaPieno};
          color: #ffffff;
          font-size: 15px;
          font-weight: 700;
          white-space: nowrap;
          box-shadow: 0 4px 14px rgba(15, 23, 42, 0.25);
          cursor: pointer;
        }
        .map-search-area.map-area-count {
          background: ${brand.calce};
          color: ${brand.grafite};
          font-weight: 600;
          cursor: default;
        }
        .map-search-area:focus-visible,
        .map-fullscreen-close:focus-visible,
        .map-area-reset:focus-visible {
          outline: 2px solid ${brand.cianografiaScuro};
          outline-offset: 2px;
        }
        .map-fullscreen-close {
          position: absolute;
          top: calc(env(safe-area-inset-top, 0px) + 14px);
          right: 14px;
          z-index: 600;
          width: 44px;
          height: 44px;
          border-radius: 50%;
          border: none;
          background: ${brand.calce};
          color: ${brand.grafite};
          box-shadow: 0 4px 14px rgba(15, 23, 42, 0.25);
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
        }
        .map-area-notice {
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 4px 12px;
          padding: 10px 14px;
          border-radius: 10px;
          border: 1px solid ${brand.filetto};
          background: ${brand.calce};
          color: ${brand.grafite};
          font-size: 15px;
        }
        .map-area-reset {
          min-height: 40px;
          padding: 0 4px;
          border: none;
          background: none;
          color: ${brand.cianografiaScuro};
          font-size: 15px;
          font-weight: 700;
          text-decoration: underline;
          text-underline-offset: 3px;
          cursor: pointer;
        }
        .map-expand-toggle {
          display: none;
        }
        .results-list-col {
          width: 100%;
          min-width: 0;
        }
        @media (min-width: 700px) {
          .results-layout {
            flex-direction: row;
            /* "stretch": allunga ENTRAMBE le colonne all'altezza della PIÙ
               ALTA delle due (mai riduce nulla — la mappa non rimpicciolisce
               mai, vedi commento sul margine di slack più sopra in questo
               file). Quando la lista è più alta della mappa (molti
               risultati) dà già slack reale allo sticky per costruzione. */
            align-items: stretch;
            gap: 20px;
          }
          .mobile-map-toggle {
            display: none;
          }
          .results-map-col,
          .results-map-col.mobile-open {
            display: flex;
            position: static;
            z-index: auto;
            background: none;
            width: 40%;
            max-width: 480px;
            min-width: 260px;
            flex-shrink: 0;
            order: 2;
            transition: max-width 220ms cubic-bezier(0.2, 0.8, 0.2, 1);
            /* Margine minimo di slack (richiesta esplicita dell'utente: la
               mappa non deve spostarsi durante lo scroll NÉ rimpicciolirsi
               con pochi risultati) — mai sotto l'altezza naturale della
               mappa stessa (min-height, mai height secca: non riduce
               mai nulla), garantisce sempre almeno ~280px di spazio in più
               oltre a quello della mappa perché lo sticky abbia margine di
               manovra anche quando la lista è più corta della mappa. */
            min-height: calc(100vh - 96px + 280px);
          }
          .results-map-col.expanded {
            width: 58%;
            max-width: 760px;
          }
          /* Ferma sotto l'intestazione fissa del sito (64px) con 16px di
             respiro, e alta quanto tutto lo schermo che resta, con 16px
             anche in fondo (docs/changelog/2026-11-04-mappa-ricerca-altezza.md):
             prima "top: 24px" la faceva finire sotto l'intestazione e
             lasciava ~110px vuoti in basso. */
          .results-map-sticky {
            position: sticky;
            top: 80px;
            height: calc(100vh - 96px);
            height: calc(100dvh - 96px);
            min-height: 420px;
          }
          .map-expand-toggle {
            display: flex;
            align-items: center;
            gap: 6px;
            position: absolute;
            top: 12px;
            right: 12px;
            z-index: 500;
            padding: 8px 12px;
            border-radius: 4px;
            border: 1px solid ${brand.filetto};
            background: ${brand.calce};
            color: ${brand.grafite};
            font-size: 12px;
            font-weight: 600;
            cursor: pointer;
          }
          .results-list-col {
            flex: 1;
            min-width: 240px;
            order: 1;
          }
        }
      `}</style>
    </div>
  );
}

/**
 * "Scegli" / "Scelto" sulla scheda (docs/CHANGELOG.md §393): non apre il
 * profilo. Al massimo resta visibile ma spento, con il motivo detto a voce.
 */
function ChooseToggle({
  pro,
  selection,
}: {
  pro: ProfessionalSearchResult;
  selection: NonNullable<Parameters<typeof ResultsListWithMap>[0]["selection"]>;
}) {
  const selected = selection.selectedIds.has(pro.id);
  const blocked = !selected && !selection.canAdd;
  return (
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
    <span onClick={(e) => e.stopPropagation()} style={{ display: "inline-flex", flexShrink: 0 }}>
      <button
        type="button"
        className="choose-toggle"
        data-selected={selected ? "true" : undefined}
        aria-pressed={selected}
        aria-disabled={blocked || undefined}
        aria-label={selected ? `Scelto: ${pro.businessName}` : `Scegli ${pro.businessName}`}
        title={blocked ? `Puoi sceglierne al massimo ${selection.max}` : undefined}
        onClick={() => {
          if (blocked) selection.onBlocked?.();
          else selection.onToggle(pro);
        }}
      >
        {selected ? <Check size={16} strokeWidth={2.5} aria-hidden /> : <Plus size={16} strokeWidth={2.5} aria-hidden />}
        {selected ? "Scelto" : "Scegli"}
      </button>
    </span>
  );
}
