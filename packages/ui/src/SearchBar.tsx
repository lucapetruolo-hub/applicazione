"use client";

import { useId, useState, type ReactNode } from "react";
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
};

export type SearchMode = "domicilio" | "online";

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
};

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
}: SearchBarProps) {
  const [query, setQuery] = useState(initialQuery);
  const [city, setCity] = useState(initialCity);
  const [mode, setMode] = useState<SearchMode>(initialMode);
  const [selectedProfessional, setSelectedProfessional] = useState<ProfessionalSuggestion | undefined>();
  const fieldId = useId();

  if (compact) {
    return (
      <XStack gap="$2" alignItems="center">
        <XStack gap="$1" backgroundColor={brand.gesso} borderRadius="$10" padding={2}>
          {MODE_TABS.map((tab) => {
            const active = tab.key === mode;
            return (
              <XStack
                key={tab.key}
                width={28}
                height={28}
                borderRadius="$10"
                backgroundColor={active ? brand.cianografia : "transparent"}
                cursor="pointer"
                alignItems="center"
                justifyContent="center"
                onPress={() => handleModeChange(tab.key)}
                accessibilityRole="button"
                accessibilityLabel={tab.label}
              >
                <Icon name={tab.icon} size={13} color={active ? "white" : brand.grafite70} />
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
            placeholder="Cosa cerchi?"
            size="$3"
            maxResults={professionalSuggestions.length}
            renderItem={(item) => (
              <YStack gap="$1">
                <Text fontWeight="600">{item.name}</Text>
                <Text fontSize={13} color="$color10">
                  {item.subtitle}
                </Text>
              </YStack>
            )}
          />
        </XStack>
        <XStack width={150}>
          <Autocomplete
            items={citySuggestions}
            getKey={(item) => item}
            getLabel={(item) => item}
            onSelect={(selectedCity) => setCity(selectedCity)}
            value={city}
            onChangeText={setCity}
            placeholder="Città"
            size="$3"
            minChars={3}
          />
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
    if (professional.city) {
      setCity(professional.city);
    }
    setSelectedProfessional(professional);
  }

  function handleQueryChange(text: string) {
    setQuery(text);
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
      <XStack gap="$2" backgroundColor={brand.gesso} borderRadius="$10" padding="$1" alignSelf="flex-start">
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
              gap="$2"
              onPress={() => handleModeChange(tab.key)}
              accessibilityRole="button"
              accessibilityLabel={tab.label}
            >
              <Icon name={tab.icon} size={15} color={active ? "white" : brand.grafite70} />
              <Text fontSize={16} fontWeight="600" color={active ? "white" : brand.grafite70}>
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
          label="Cosa cerchi"
          id={`${fieldId}-cosa`}
          placeholder={mode === "online" ? "Es. consulenza idraulico" : "Es. idraulico"}
          size="$5"
          maxResults={professionalSuggestions.length}
          renderItem={(item) => (
            <YStack gap="$1">
              <Text fontWeight="600">{item.name}</Text>
              <Text fontSize={13} color="$color10">
                {item.subtitle}
              </Text>
            </YStack>
          )}
        />
        <XStack width={1} height={44} marginBottom={4} backgroundColor={brand.filetto} display="none" $gtSm={{ display: "flex" }} />
        <Autocomplete
          items={citySuggestions}
          getKey={(item) => item}
          getLabel={(item) => item}
          onSelect={(selectedCity) => setCity(selectedCity)}
          value={city}
          onChangeText={setCity}
          label={mode === "online" ? "Città (facoltativa)" : "Città"}
          id={`${fieldId}-citta`}
          placeholder="Es. Milano"
          size="$5"
          minChars={3}
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
