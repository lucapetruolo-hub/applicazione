"use client";

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { Text, XStack, YStack } from "tamagui";
import { Autocomplete } from "./Autocomplete";
import { Button } from "./Button";
import { Icon, type IconName } from "./Icon";
import { brand, radiusDoc } from "./tokens";

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

type CityOption = { key: string; label: string; city: string; detail?: string };

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

function useCityField({
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
    renderItem: (item: CityOption) =>
      item.detail ? (
        <YStack gap="1">
          <Text>{item.label}</Text>
          <Text fontSize={13} color="color10">
            {item.detail}
          </Text>
        </YStack>
      ) : (
        <Text>{item.label}</Text>
      ),
    maxResults: 30,
  };
}

const MODE_TABS: { key: SearchMode; label: string; icon: IconName }[] = [
  { key: "domicilio", label: "A domicilio", icon: "house" },
  { key: "online", label: "Online", icon: "video" },
];

export function SearchBar({
  onSearch,
  initialQuery = "",
  initialCity = "",
  initialMode = "domicilio",
  professionalSuggestions = [],
  citySuggestions = [],
  searchOnModeChange = false,
  compact = false,
  wrapSearchButton = (button) => button,
  cityAliases = [],
  cityDefaults = [],
  preferredCities = [],
  onNearMe,
  onQueryChange,
  queryField,
  footer,
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
  const modeMenuRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!modeMenuOpen) return;
    const doc = (globalThis as { document?: Document }).document;
    if (!doc) return;
    function onPointer(event: MouseEvent) {
      if (modeMenuRef.current && !modeMenuRef.current.contains(event.target as Node)) setModeMenuOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setModeMenuOpen(false);
    }
    doc.addEventListener("mousedown", onPointer);
    doc.addEventListener("keydown", onKey);
    return () => {
      doc.removeEventListener("mousedown", onPointer);
      doc.removeEventListener("keydown", onKey);
    };
  }, [modeMenuOpen]);

  if (compact) {
    const activeTab = MODE_TABS.find((tab) => tab.key === mode) ?? MODE_TABS[0]!;
    const runSearch = () =>
      onSearch({
        query,
        city,
        mode,
        professional: selectedProfessional?.name === query ? selectedProfessional : undefined,
      });
    // Una sola pillola bianca: modo, "Cosa ti serve?", "Città" e la lente
    // (richiesta di Luca, docs/changelog/2026-11-09-barra-in-alto-semplice.md).
    // Il modo si sceglie da un piccolo elenco invece di due pulsanti sempre
    // visibili; il nome resta scritto accanto all'icona (§349).
    return (
      <XStack
        ref={modeMenuRef as never}
        className="search-pill"
        position="relative"
        alignItems="center"
        height={48}
        paddingHorizontal={5}
        gap={2}
        backgroundColor={brand.calce}
        borderWidth={1}
        borderColor="#EADFD3"
        borderRadius={999}
      >
        <XStack
          className="press-scale"
          height={38}
          gap={6}
          paddingHorizontal={12}
          borderRadius={999}
          backgroundColor="#EEF6F1 hover:#E2F0E8"
          cursor="pointer"
          alignItems="center"
          onPress={() => setModeMenuOpen((open) => !open)}
          role="button"
          aria-haspopup="menu"
          aria-expanded={modeMenuOpen}
          aria-label={`Dove si svolge: ${activeTab.label}. Cambia`}
        >
          <Icon name={activeTab.icon} size={15} color={brand.cianografiaPieno} />
          {/* Sotto i 1281 px solo l'icona, come prima (§349): la barra non ci sta. */}
          <Text display="none gtLg:flex" fontSize={14} fontWeight="600" color={brand.cianografiaPieno} whiteSpace="nowrap">
            {activeTab.label}
          </Text>
          <Icon name={modeMenuOpen ? "chevron-up" : "chevron-down"} size={14} color={brand.cianografiaPieno} />
        </XStack>
        {modeMenuOpen ? (
          <YStack
            className="pop-in"
            role="menu"
            aria-label="Dove si svolge"
            position="absolute"
            top="100%"
            left={0}
            marginTop={8}
            width={220}
            padding={6}
            backgroundColor="white"
            borderRadius={16}
            zIndex={1000}
            shadowColor="rgba(43,32,19,0.14)"
            shadowRadius={28}
            shadowOffset={{ width: 0, height: 8 }}
          >
            {MODE_TABS.map((tab) => {
              const active = tab.key === mode;
              return (
                <XStack
                  key={tab.key}
                  // Tamagui non conosce "menuitemradio": passato così al sito.
                  {...({
                    role: "menuitemradio",
                    "aria-checked": active,
                    tabIndex: 0,
                    onKeyDown: (event: { key: string; preventDefault: () => void }) => {
                      if (event.key !== "Enter" && event.key !== " ") return;
                      event.preventDefault();
                      setModeMenuOpen(false);
                      handleModeChange(tab.key);
                    },
                  } as Record<string, unknown>)}
                  gap={10}
                  alignItems="center"
                  paddingHorizontal={12}
                  paddingVertical={11}
                  borderRadius={10}
                  cursor="pointer"
                  backgroundColor={active ? "#EEF6F1" : "transparent hover:#F6F1EC"}
                  onPress={() => {
                    setModeMenuOpen(false);
                    handleModeChange(tab.key);
                  }}
                >
                  <Icon name={tab.icon} size={16} color={active ? brand.cianografiaPieno : brand.grafite70} />
                  <Text fontSize={15} fontWeight={active ? "600" : "400"} color={brand.grafite} flex={1}>
                    {tab.label}
                  </Text>
                  {active ? <Icon name="check" size={16} color={brand.cianografiaPieno} /> : null}
                </XStack>
              );
            })}
          </YStack>
        ) : null}
        <XStack width="140px gtLg:210px">
          <Autocomplete
            items={professionalSuggestions}
            getKey={(item) => item.id}
            getLabel={(item) => item.name}
            onSelect={handleSelectProfessional}
            value={query}
            onChangeText={handleQueryChange}
            placeholder="Cosa ti serve?"
            inputClassName="search-pill-input"
            size="3"
            maxResults={professionalSuggestions.length}
            renderItem={(item) => (
              <YStack gap="1">
                <Text fontWeight="600">{item.title ?? item.name}</Text>
                <Text fontSize={13} color="color10">
                  {item.subtitle}
                </Text>
              </YStack>
            )}
          />
        </XStack>
        <XStack width={1} height={24} backgroundColor="#EADFD3" aria-hidden />
        <XStack width="110px gtLg:150px">
          <Autocomplete {...cityField} value={city} onChangeText={setCity} placeholder="Città" inputClassName="search-pill-input" size="3" />
        </XStack>
        {wrapSearchButton(
          <Button
            variant="primary"
            size="3"
            width={38}
            height={38}
            paddingHorizontal={0}
            borderRadius={999}
            aria-label="Cerca"
            onPress={runSearch}
          >
            <Icon name="search" size={17} color="white" />
          </Button>
        )}
      </XStack>
    );
  }

  function handleModeChange(next: SearchMode) {
    if (next === mode) return;
    setMode(next);
    if (searchOnModeChange) {
      onSearch({
        query,
        city,
        mode: next,
        professional: selectedProfessional?.name === query ? selectedProfessional : undefined,
      });
    }
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

  const customQueryField = mode === "domicilio" ? queryField : undefined;

  return (
    <>
      <YStack
        gap="3"
        backgroundColor={brand.calce}
        padding="3"
        borderRadius={radiusDoc}
        shadowColor="rgba(43,32,19,0)"
        shadowRadius={0}
        shadowOffset={{ width: 0, height: 0 }}
        shadowOpacity={1}
      >
        {/* Da telefono le due schede occupano tutta la larghezza a metà ciascuna,
            sotto i 390 px larghe quanto il testo, su una riga: a 320 px "Online" usciva dal riquadro
            (docs/changelog/2026-10-28-richiedi-preventivo-in-alto.md). */}
        <XStack
          gap="2 xxs:1"
          backgroundColor={brand.gesso}
          borderRadius="10"
          padding="1"
          alignSelf="flex-start xs:stretch"
        >
          {MODE_TABS.map((tab) => {
            const active = tab.key === mode;
            return (
              <XStack
                key={tab.key}
                className="press-scale"
                paddingHorizontal="3 xxs:2"
                paddingVertical="2"
                borderRadius="10"
                backgroundColor={active ? brand.cianografiaPieno : "transparent"}
                cursor="pointer"
                alignItems="center"
                justifyContent="center"
                flexGrow="xs:1"
                flexBasis="xs:0px xxs:auto"
                gap="2 xxs:1"
                onPress={() => handleModeChange(tab.key)}
                role="button"
                aria-pressed={active}
                aria-label={tab.label}
              >
                <Icon name={tab.icon} size={15} color={active ? "white" : brand.grafite70} />
                <Text fontSize="16px xxs:15px" whiteSpace="nowrap" fontWeight="600" color={active ? "white" : brand.grafite70}>
                  {tab.label}
                </Text>
              </XStack>
            );
          })}
        </XStack>

        {/* flex-end: con le etichette sopra i campi, "Cerca" resta allineato ai campi e non alle etichette. */}
        <YStack gap="3" flexDirection="gtSm:row" alignItems="gtSm:flex-end">
          <Autocomplete
            items={professionalSuggestions}
            getKey={(item) => item.id}
            getLabel={(item) => item.name}
            onSelect={handleSelectProfessional}
            value={query}
            onChangeText={handleQueryChange}
            // Etichetta vera sopra il campo ed esempio corto dentro: quello
            // lungo di prima veniva tagliato ("Es. Idraulico, Elettricis").
            // L'esempio dice che il campo capisce anche il problema (§392,
            // docs/changelog/2026-10-28-richiedi-preventivo-in-alto.md); corto
            // perché stia intero anche su un telefono da 320 px.
            label={customQueryField?.label ?? "Cosa ti serve?"}
            labelBadge={customQueryField?.badge}
            focusRef={queryFocusRef}
            inputClassName={customQueryField?.className}
            id={`${fieldId}-cosa`}
            placeholder={customQueryField?.placeholder ?? (mode === "online" ? "Es. consulenza idraulico" : "Es. idraulico, un guasto")}
            size="5"
            maxResults={professionalSuggestions.length + (customQueryField?.examples?.length ?? 0)}
            emptyItems={customQueryField?.examples?.length ? [...customQueryField.examples, ...professionalSuggestions] : undefined}
            emptyHeadings={
              customQueryField?.examples?.length
                ? [
                    { index: 0, label: "Scrivi il problema, per esempio:" },
                    { index: customQueryField.examples.length, label: "Oppure scegli chi cerchi:" },
                  ]
                : undefined
            }
            renderItem={(item) => (
              <YStack gap="1">
                <Text fontWeight="600">{item.title ?? item.name}</Text>
                <Text fontSize={13} color="color10">
                  {item.subtitle}
                </Text>
              </YStack>
            )}
          />
          <XStack width={1} height={44} marginBottom={4} backgroundColor={brand.filetto} display="none gtSm:flex" />
          <Autocomplete
            {...cityField}
            value={city}
            onChangeText={setCity}
            label={mode === "online" ? "Città (facoltativa)" : "Città"}
            focusRef={cityFocusRef}
            id={`${fieldId}-citta`}
            placeholder="Es. Milano"
            size="5"
          />
          {wrapSearchButton(
            <Button
              variant="primary"
              onPress={() =>
                onSearch({
                  query,
                  city,
                  mode,
                  professional: selectedProfessional?.name === query ? selectedProfessional : undefined,
                })
              }
            >
              Cerca
            </Button>
          )}
        </YStack>
        {mode === "online" ? (
          <Text fontSize={13} color={brand.grafite70}>
            Consulenza online: parla con il professionista da remoto, ovunque tu sia. Puoi indicare una città per
            trovare professionisti online della tua zona.
          </Text>
        ) : null}
      </YStack>
      {footer?.({ mode, fillQuery, searchFor })}
    </>
  );
}
