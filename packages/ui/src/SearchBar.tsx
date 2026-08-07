"use client";

import { useState } from "react";
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
   * Scorciatoie "Preventivo"/"Richiesta urgente" mostrate sulla destra della
   * riga dei tab A domicilio/Online — richiesta esplicita dell'utente,
   * homepage. Callback invece di un `href`: `packages/ui` resta agnostico
   * dal routing (Next.js `Link` su web, deep link su mobile), stesso
   * principio già seguito per `onSearch`. Assenti di default: nessun cambio
   * visivo per i chiamanti esistenti (SearchHeader, home mobile) che non li
   * passano.
   */
  onQuoteRequest?: () => void;
  onUrgentRequest?: () => void;
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
  onQuoteRequest,
  onUrgentRequest,
}: SearchBarProps) {
  const [query, setQuery] = useState(initialQuery);
  const [city, setCity] = useState(initialCity);
  const [mode, setMode] = useState<SearchMode>(initialMode);
  const [selectedProfessional, setSelectedProfessional] = useState<ProfessionalSuggestion | undefined>();

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
      <XStack justifyContent="space-between" alignItems="center" flexWrap="wrap" gap="$2">
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
                onPress={() => setMode(tab.key)}
                accessibilityRole="button"
                accessibilityLabel={tab.label}
              >
                <Icon name={tab.icon} size={15} color={active ? "white" : brand.grafite70} />
                <Text fontSize="$3" fontWeight="600" color={active ? "white" : brand.grafite70}>
                  {tab.label}
                </Text>
              </XStack>
            );
          })}
        </XStack>

        {onQuoteRequest || onUrgentRequest ? (
          <XStack gap="$3" alignItems="center">
            {onQuoteRequest ? (
              <XStack
                cursor="pointer"
                alignItems="center"
                gap="$1.5"
                onPress={onQuoteRequest}
                accessibilityRole="button"
                accessibilityLabel="Richiedi un preventivo"
              >
                <Icon name="file-text" size={14} color={brand.grafite70} />
                <Text fontSize="$3" fontWeight="600" color={brand.grafite70}>
                  Preventivo
                </Text>
              </XStack>
            ) : null}
            {onUrgentRequest ? (
              // Scritto differente per far capire subito che è un'urgenza
              // (richiesta esplicita dell'utente): colore/peso distinti dal
              // link "Preventivo" accanto, stesso token semantico "rosso
              // solo su urgenza/distruttivo" già in uso ovunque nel prodotto.
              <XStack
                cursor="pointer"
                alignItems="center"
                gap="$1.5"
                onPress={onUrgentRequest}
                accessibilityRole="button"
                accessibilityLabel="Richiesta urgente"
              >
                <Icon name="zap" size={14} color={brand.urgenza} />
                <Text fontSize="$3" fontWeight="800" color={brand.urgenza}>
                  Richiesta urgente
                </Text>
              </XStack>
            ) : null}
          </XStack>
        ) : null}
      </XStack>

      <YStack gap="$3" $gtSm={{ flexDirection: "row", alignItems: "flex-start" }}>
        <Autocomplete
          items={professionalSuggestions}
          getKey={(item) => item.id}
          getLabel={(item) => item.name}
          onSelect={handleSelectProfessional}
          value={query}
          onChangeText={handleQueryChange}
          placeholder={mode === "online" ? "Cosa ti serve? Es. Consulenza idraulico..." : "Cosa cerchi? Es. Idraulico, Elettricista..."}
          size="$5"
          maxResults={professionalSuggestions.length}
          renderItem={(item) => (
            <YStack gap="$1">
              <Text fontWeight="600">{item.name}</Text>
              <Text fontSize="$2" color="$color10">
                {item.subtitle}
              </Text>
            </YStack>
          )}
        />
        <XStack width={1} height={44} backgroundColor={brand.filetto} display="none" $gtSm={{ display: "flex" }} />
        <Autocomplete
          items={citySuggestions}
          getKey={(item) => item}
          getLabel={(item) => item}
          onSelect={(selectedCity) => setCity(selectedCity)}
          value={city}
          onChangeText={setCity}
          placeholder={mode === "online" ? "Città (opzionale)" : "Città"}
          size="$5"
          minChars={3}
        />
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
      </YStack>
      {mode === "online" ? (
        <Text fontSize="$2" color={brand.grafite70}>
          Consulenza online: parla con il professionista da remoto, ovunque tu sia. Puoi indicare una città per
          trovare professionisti online della tua zona.
        </Text>
      ) : null}
    </YStack>
  );
}
