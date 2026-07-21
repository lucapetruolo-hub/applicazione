import { useState } from "react";
import { Text, XStack, YStack } from "tamagui";
import { Autocomplete } from "./Autocomplete";
import { Button } from "./Button";

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
};

const MODE_TABS: { key: SearchMode; label: string; icon: string }[] = [
  { key: "domicilio", label: "A domicilio", icon: "🏠" },
  { key: "online", label: "Online", icon: "📹" },
];

export function SearchBar({
  onSearch,
  initialQuery = "",
  initialCity = "",
  initialMode = "domicilio",
  professionalSuggestions = [],
  citySuggestions = [],
}: SearchBarProps) {
  const [query, setQuery] = useState(initialQuery);
  const [city, setCity] = useState(initialCity);
  const [mode, setMode] = useState<SearchMode>(initialMode);

  function handleSelectProfessional(professional: ProfessionalSuggestion) {
    setQuery(professional.name);
    setCity(professional.city);
    onSearch({ query: professional.name, city: professional.city, professional, mode });
  }

  return (
    <YStack
      gap="$3"
      backgroundColor="white"
      padding="$3"
      borderRadius="$6"
      shadowColor="$shadowColor"
      shadowRadius={20}
      shadowOpacity={0.15}
      elevation="$2"
    >
      <XStack gap="$2" backgroundColor="$color3" borderRadius="$10" padding="$1" alignSelf="flex-start">
        {MODE_TABS.map((tab) => {
          const active = tab.key === mode;
          return (
            <XStack
              key={tab.key}
              paddingHorizontal="$3"
              paddingVertical="$2"
              borderRadius="$10"
              backgroundColor={active ? "$blue10" : "transparent"}
              cursor="pointer"
              onPress={() => setMode(tab.key)}
              accessibilityRole="button"
              accessibilityLabel={tab.label}
            >
              <Text fontSize="$3" fontWeight="600" color={active ? "white" : "$color11"}>
                {tab.icon} {tab.label}
              </Text>
            </XStack>
          );
        })}
      </XStack>

      <YStack gap="$3" $gtSm={{ flexDirection: "row", alignItems: "flex-start" }}>
        <Autocomplete
          items={professionalSuggestions}
          getKey={(item) => item.id}
          getLabel={(item) => item.name}
          onSelect={handleSelectProfessional}
          value={query}
          onChangeText={setQuery}
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
        {mode === "domicilio" ? (
          <>
            <XStack width={1} height={44} backgroundColor="$borderColor" display="none" $gtSm={{ display: "flex" }} />
            <Autocomplete
              items={citySuggestions}
              getKey={(item) => item}
              getLabel={(item) => item}
              onSelect={(selectedCity) => setCity(selectedCity)}
              value={city}
              onChangeText={setCity}
              placeholder="Città"
              size="$5"
            />
          </>
        ) : null}
        <Button size="$5" onPress={() => onSearch({ query, city: mode === "online" ? "" : city, mode })}>
          Cerca
        </Button>
      </YStack>
      {mode === "online" ? (
        <Text fontSize="$2" color="$color9">
          ℹ️ Consulenza online: parla con il professionista da remoto, ovunque tu sia.
        </Text>
      ) : null}
    </YStack>
  );
}
