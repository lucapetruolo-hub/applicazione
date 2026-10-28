"use client";

import { useId, useMemo, useState, type ReactNode } from "react";
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
        <YStack gap="$1">
          <Text>{item.label}</Text>
          <Text fontSize={13} color="$color10">
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
}: SearchBarProps) {
  const [query, setQuery] = useState(initialQuery);
  const [city, setCity] = useState(initialCity);
  const [mode, setMode] = useState<SearchMode>(initialMode);
  const [selectedProfessional, setSelectedProfessional] = useState<ProfessionalSuggestion | undefined>();
  const fieldId = useId();
  const cityField = useCityField({ citySuggestions, cityAliases, cityDefaults, preferredCities, onNearMe, setCity });

  if (compact) {
    return (
      <XStack gap="$2" alignItems="center">
        <XStack gap="$1" backgroundColor={brand.gesso} borderRadius="$10" padding={2}>
          {MODE_TABS.map((tab) => {
            const active = tab.key === mode;
            return (
              // Con lo spazio (schermi da 1281 px) anche il nome del modo
              // accanto all'icona (docs/CHANGELOG.md §349): la sola casa o
              // videocamera non diceva cosa sceglieva.
              <XStack
                key={tab.key}
                minWidth={28}
                height={28}
                gap={5}
                $gtLg={{ paddingHorizontal: 10 }}
                borderRadius="$10"
                backgroundColor={active ? brand.cianografia : "transparent"}
                cursor="pointer"
                alignItems="center"
                justifyContent="center"
                onPress={() => handleModeChange(tab.key)}
                accessibilityRole="button"
                accessibilityLabel={tab.label}
                aria-pressed={active}
              >
                <Icon name={tab.icon} size={13} color={active ? "white" : brand.grafite70} />
                <Text display="none" $gtLg={{ display: "flex" }} fontSize={13} fontWeight="600" color={active ? "white" : brand.grafite70}>
                  {tab.label}
                </Text>
              </XStack>
            );
          })}
        </XStack>
        <XStack width={150}>
          <Autocomplete
            items={professionalSuggestions}
            getKey={(item) => item.id}
            getLabel={(item) => item.name}
            onSelect={handleSelectProfessional}
            value={query}
            onChangeText={handleQueryChange}
            placeholder="Cosa ti serve?"
            size="$3"
            maxResults={professionalSuggestions.length}
            renderItem={(item) => (
              <YStack gap="$1">
                <Text fontWeight="600">{item.title ?? item.name}</Text>
                <Text fontSize={13} color="$color10">
                  {item.subtitle}
                </Text>
              </YStack>
            )}
          />
        </XStack>
        <XStack width={150}>
          <Autocomplete {...cityField} value={city} onChangeText={setCity} placeholder="Città" size="$3" />
        </XStack>
        {wrapSearchButton(
          <Button
            variant="primary"
            size="$3"
            height={36}
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
  }

  function handleQueryChange(text: string) {
    setQuery(text);
    onQueryChange?.(text);
    setSelectedProfessional(undefined);
  }

  return (
    <YStack
      gap="$3"
      backgroundColor={brand.calce}
      padding="$3"
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
        gap="$2"
        backgroundColor={brand.gesso}
        borderRadius="$10"
        padding="$1"
        alignSelf="flex-start"
        $xs={{ alignSelf: "stretch" }}
        $xxs={{ gap: "$1" }}
      >
        {MODE_TABS.map((tab) => {
          const active = tab.key === mode;
          return (
            <XStack
              key={tab.key}
              paddingHorizontal="$3"
              paddingVertical="$2"
              borderRadius="$10"
              backgroundColor={active ? brand.cianografia : "transparent"}
              cursor="pointer"
              alignItems="center"
              justifyContent="center"
              $xs={{ flexGrow: 1, flexBasis: 0 }}
              $xxs={{ flexBasis: "auto", paddingHorizontal: "$2", gap: "$1" }}
              gap="$2"
              onPress={() => handleModeChange(tab.key)}
              accessibilityRole="button"
              accessibilityLabel={tab.label}
            >
              <Icon name={tab.icon} size={15} color={active ? "white" : brand.grafite70} />
              <Text fontSize={16} $xxs={{ fontSize: 15 }} whiteSpace="nowrap" fontWeight="600" color={active ? "white" : brand.grafite70}>
                {tab.label}
              </Text>
            </XStack>
          );
        })}
      </XStack>

      {/* flex-end: con le etichette sopra i campi, "Cerca" resta allineato ai campi e non alle etichette. */}
      <YStack gap="$3" $gtSm={{ flexDirection: "row", alignItems: "flex-end" }}>
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
          label="Cosa ti serve?"
          id={`${fieldId}-cosa`}
          placeholder={mode === "online" ? "Es. consulenza idraulico" : "Es. idraulico, un guasto"}
          size="$5"
          maxResults={professionalSuggestions.length}
          renderItem={(item) => (
            <YStack gap="$1">
              <Text fontWeight="600">{item.title ?? item.name}</Text>
              <Text fontSize={13} color="$color10">
                {item.subtitle}
              </Text>
            </YStack>
          )}
        />
        <XStack width={1} height={44} marginBottom={4} backgroundColor={brand.filetto} display="none" $gtSm={{ display: "flex" }} />
        <Autocomplete
          {...cityField}
          value={city}
          onChangeText={setCity}
          label={mode === "online" ? "Città (facoltativa)" : "Città"}
          id={`${fieldId}-citta`}
          placeholder="Es. Milano"
          size="$5"
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
  );
}
