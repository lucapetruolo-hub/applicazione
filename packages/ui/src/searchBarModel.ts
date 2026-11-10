import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import type { IconName } from "./Icon";

/**
 * Logica comune della barra di ricerca: la usano `SearchBar.tsx` (app) e
 * `SearchBar.web.tsx` (sito in HTML semplice,
 * docs/changelog/2026-11-10-barra-di-ricerca-senza-tamagui.md). Qui tipi,
 * stato e comportamento; i due file disegnano soltanto. Se cambia uno dei
 * due disegni, va cambiato anche l'altro.
 */
export type ProfessionalSuggestion = {
  id: string;
  name: string;
  subtitle: string;
  categorySlug: string;
  city: string;
  /** Riga in grassetto al posto del nome (la descrizione del problema, docs/CHANGELOG.md §392). */
  title?: string;
};

export type SearchMode = "domicilio" | "online";

/** Una frazione o località che porta al suo comune ("Borgo Sabotino" → Latina, §383). */
export type CityAlias = { name: string; city: string };

export type CityOption = { key: string; label: string; city: string; detail?: string };

export type SearchBarProps = {
  onSearch: (params: { query: string; city: string; professional?: ProfessionalSuggestion; mode: SearchMode }) => void;
  initialQuery?: string;
  initialCity?: string;
  initialMode?: SearchMode;
  /** Suggerimenti mostrati mentre si scrive nel campo "Cosa cerchi". */
  professionalSuggestions?: ProfessionalSuggestion[];
  /** Suggerimenti mostrati mentre si scrive nel campo "Città". */
  citySuggestions?: string[];
  /**
   * Richiesta esplicita dell'utente: nelle pagine risultati (SearchHeader)
   * cambiare "A domicilio"/"Online" deve aggiornare SUBITO la lista, senza
   * dover ripremere "Cerca" — la barra resta in cima proprio per ritentare
   * la ricerca al volo. In home (nessun valore) il tab cambia solo lo stato
   * locale e la ricerca parte dal bottone, come prima.
   */
  searchOnModeChange?: boolean;
  /**
   * Resa condensata a riga singola, pensata per stare dentro la barra
   * fissa in alto (64px) invece che in un pannello a sé — richiesta
   * esplicita dell'utente: "una volta effettuata la ricerca sposta le due
   * stringhe di ricerca... sopra sulla barra fissa in alto". Niente
   * sfondo/padding/ombra della card, tab modalità solo icona, campi e
   * bottone più piccoli, nessun testo di aiuto sotto.
   */
  compact?: boolean;
  /**
   * Avvolge il pulsante "Cerca" (es. con l'effetto magnete del web,
   * docs/CHANGELOG.md §233). Senza, il pulsante resta com'è.
   */
  wrapSearchButton?: (button: ReactNode) => ReactNode;
  /** Frazioni e località cercabili nel campo "Città": scegliendole si cerca nel loro comune. */
  cityAliases?: readonly CityAlias[];
  /** Elenco del campo "Città" vuoto, appena cliccato (ultima usata, poi le più cercate). */
  cityDefaults?: readonly string[];
  /**
   * Città con professionisti vicini per il lavoro scelto: mentre si scrive
   * vengono prima delle altre, senza numeri (decisione dell'utente, §383).
   */
  preferredCities?: readonly string[];
  /** "Vicino a me": restituisce il comune della posizione, o `null` se non disponibile. */
  onNearMe?: () => Promise<string | null>;
  /** Avvisa quando cambia il testo di "Cosa cerchi" (per chiedere le città adatte a quel lavoro). */
  onQueryChange?: (query: string) => void;
  /**
   * Etichetta, pillola ed esempio del primo campo con "A domicilio" (la home
   * invita a descrivere il problema, docs/changelog/2026-11-03-ricerca-per-problema-home.md).
   * Con "Online" restano "Cosa ti serve?" e l'esempio della consulenza.
   */
  queryField?: {
    label: string;
    badge?: string;
    placeholder: string;
    className?: string;
    /**
     * Frasi d'esempio in cima all'elenco a campo vuoto, prima dei mestieri
     * (home, docs/changelog/2026-11-03-luci-che-accelerano.md): dicono che si
     * può scrivere il problema con parole proprie.
     */
    examples?: ProfessionalSuggestion[];
  };
  /**
   * Contenuto sotto il riquadro (gli esempi da toccare della home): riceve il
   * modo scelto, `fillQuery`, che scrive un testo nel campo e ci mette il
   * cursore, e `searchFor`, che lo scrive e fa subito partire la ricerca
   * (docs/changelog/2026-11-04-esempi-cercano-subito.md).
   */
  footer?: (api: { mode: SearchMode; fillQuery: (text: string) => void; searchFor: (text: string) => void }) => ReactNode;
};


export const MODE_TABS: { key: SearchMode; label: string; icon: IconName }[] = [
  { key: "domicilio", label: "A domicilio", icon: "house" },
  { key: "online", label: "Online", icon: "video" },
];

/** Campo "Città": comuni, frazioni, elenco a campo vuoto e "Vicino a me". `renderItem` lo aggiunge chi disegna. */
export function useCityField({
  citySuggestions,
  cityAliases,
  cityDefaults,
  preferredCities,
  onNearMe,
  setCity,
}: {
  citySuggestions: readonly string[];
  cityAliases: readonly CityAlias[];
  cityDefaults: readonly string[];
  preferredCities: readonly string[];
  onNearMe?: () => Promise<string | null>;
  setCity: (city: string) => void;
}) {
  const [locating, setLocating] = useState<"idle" | "busy" | "failed">("idle");
  const options = useMemo<CityOption[]>(
    () => [
      ...citySuggestions.map((city) => ({ key: city, label: city, city })),
      ...cityAliases.map((alias) => ({ key: `${alias.name}|${alias.city}`, label: alias.name, city: alias.city, detail: alias.city })),
    ],
    [citySuggestions, cityAliases],
  );
  const preferred = useMemo(() => new Set(preferredCities.map((city) => city.toLowerCase())), [preferredCities]);
  const emptyItems = useMemo(() => cityDefaults.map((city) => ({ key: `default|${city}`, label: city, city })), [cityDefaults]);
  const leadingAction = onNearMe
    ? {
        label: "Vicino a me",
        description:
          locating === "busy" ? "Cerco la tua posizione…" : locating === "failed" ? "Posizione non disponibile: scrivi la città" : "Usa la tua posizione",
        onPress: () => {
          setLocating("busy");
          return onNearMe().then((city) => {
            if (city) {
              setCity(city);
              setLocating("idle");
              return true;
            }
            setLocating("failed");
            return false;
          });
        },
      }
    : undefined;
  return {
    items: options,
    // Senza città più cercate (sito appena aperto, server che non risponde)
    // il campo vuoto mostra solo "Vicino a me", non comuni a caso.
    emptyItems,
    leadingAction,
    getKey: (item: CityOption) => item.key,
    getLabel: (item: CityOption) => item.label,
    priority: preferred.size > 0 ? (item: CityOption) => (preferred.has(item.city.toLowerCase()) ? 0 : 1) : undefined,
    onSelect: (item: CityOption) => setCity(item.city),
    maxResults: 30,
  };
}

/** Stato e azioni della barra di ricerca, uguali nelle due rese (piena e compatta). */
export function useSearchBar({
  onSearch,
  initialQuery = "",
  initialCity = "",
  initialMode = "domicilio",
  citySuggestions = [],
  searchOnModeChange = false,
  cityAliases = [],
  cityDefaults = [],
  preferredCities = [],
  onNearMe,
  onQueryChange,
  queryField,
}: SearchBarProps) {
  const [query, setQuery] = useState(initialQuery);
  const [city, setCity] = useState(initialCity);
  const [mode, setMode] = useState<SearchMode>(initialMode);
  const [selectedProfessional, setSelectedProfessional] = useState<ProfessionalSuggestion | undefined>();
  const fieldId = useId();
  const queryFocusRef = useRef<(() => void) | null>(null);
  const cityFocusRef = useRef<(() => void) | null>(null);
  const cityField = useCityField({ citySuggestions, cityAliases, cityDefaults, preferredCities, onNearMe, setCity });
  // Elenco "A domicilio / Online" della pillola compatta: si chiude con un
  // clic fuori o con Esc (solo sul sito, dove la pillola si usa).
  const [modeMenuOpen, setModeMenuOpen] = useState(false);
  const modeMenuRef = useRef<{ contains: (node: unknown) => boolean } | null>(null);
  useEffect(() => {
    if (!modeMenuOpen) return;
    // Tipi scritti a mano: il pacchetto si compila anche per l'app, senza il DOM.
    type Listener = (event: { target?: unknown; key?: string }) => void;
    const doc = (globalThis as { document?: { addEventListener: (type: string, fn: Listener) => void; removeEventListener: (type: string, fn: Listener) => void } }).document;
    if (!doc) return;
    const onPointer: Listener = (event) => {
      if (modeMenuRef.current && !modeMenuRef.current.contains(event.target)) setModeMenuOpen(false);
    };
    const onKey: Listener = (event) => {
      if (event.key === "Escape") setModeMenuOpen(false);
    };
    doc.addEventListener("mousedown", onPointer);
    doc.addEventListener("keydown", onKey);
    return () => {
      doc.removeEventListener("mousedown", onPointer);
      doc.removeEventListener("keydown", onKey);
    };
  }, [modeMenuOpen]);

  const currentProfessional = () => (selectedProfessional?.name === query ? selectedProfessional : undefined);

  function runSearch() {
    onSearch({ query, city, mode, professional: currentProfessional() });
  }

  function handleModeChange(next: SearchMode) {
    if (next === mode) return;
    setMode(next);
    if (searchOnModeChange) {
      onSearch({ query, city, mode: next, professional: currentProfessional() });
    }
  }

  /** Scelta dal piccolo elenco della pillola compatta: chiude l'elenco e cambia modo. */
  function chooseMode(next: SearchMode) {
    setModeMenuOpen(false);
    handleModeChange(next);
  }

  function handleSelectProfessional(professional: ProfessionalSuggestion) {
    setQuery(professional.name);
    onQueryChange?.(professional.name);
    if (professional.city) {
      setCity(professional.city);
    }
    setSelectedProfessional(professional);
    // Scelto "Ti serve: …" senza città, il cursore passa a Città: su telefono
    // la lista copriva il campo e non si capiva come andare avanti (prova con
    // persone simulate, punto 11, docs/changelog/2026-11-08-prova-persone-simulate.md).
    if (!professional.city && !city.trim()) cityFocusRef.current?.();
  }

  function handleQueryChange(text: string) {
    setQuery(text);
    onQueryChange?.(text);
    setSelectedProfessional(undefined);
  }

  function fillQuery(text: string) {
    handleQueryChange(text);
    // Il cursore nel campo apre l'elenco con "Ti serve: …": si vede subito chi serve.
    queryFocusRef.current?.();
  }

  function searchFor(text: string) {
    handleQueryChange(text);
    onSearch({ query: text, city, mode });
  }

  const activeTab = MODE_TABS.find((tab) => tab.key === mode) ?? MODE_TABS[0]!;
  const customQueryField = mode === "domicilio" ? queryField : undefined;

  return {
    query,
    city,
    setCity,
    mode,
    activeTab,
    fieldId,
    queryFocusRef,
    cityFocusRef,
    cityField,
    modeMenuOpen,
    setModeMenuOpen,
    modeMenuRef,
    customQueryField,
    runSearch,
    handleModeChange,
    chooseMode,
    handleSelectProfessional,
    handleQueryChange,
    fillQuery,
    searchFor,
  };
}
