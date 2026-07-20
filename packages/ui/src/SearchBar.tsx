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

export type SearchBarProps = {
  onSearch: (params: { query: string; city: string; professional?: ProfessionalSuggestion }) => void;
  initialQuery?: string;
  initialCity?: string;
  /** Suggerimenti mostrati mentre si scrive nel campo "Cosa cerchi". */
  professionalSuggestions?: ProfessionalSuggestion[];
  /** Suggerimenti mostrati mentre si scrive nel campo "Città". */
  citySuggestions?: string[];
};

export function SearchBar({
  onSearch,
  initialQuery = "",
  initialCity = "",
  professionalSuggestions = [],
  citySuggestions = [],
}: SearchBarProps) {
  const [query, setQuery] = useState(initialQuery);
  const [city, setCity] = useState(initialCity);

  function handleSelectProfessional(professional: ProfessionalSuggestion) {
    setQuery(professional.name);
    setCity(professional.city);
    onSearch({ query: professional.name, city: professional.city, professional });
  }

  return (
    <YStack
      gap="$3"
      $gtSm={{ flexDirection: "row", alignItems: "flex-start" }}
      backgroundColor="white"
      padding="$3"
      borderRadius="$6"
      shadowColor="$shadowColor"
      shadowRadius={20}
      shadowOpacity={0.15}
      elevation="$2"
    >
      <Autocomplete
        items={professionalSuggestions}
        getKey={(item) => item.id}
        getLabel={(item) => item.name}
        onSelect={handleSelectProfessional}
        value={query}
        onChangeText={setQuery}
        placeholder="Cosa cerchi? Es. Idraulico, Elettricista..."
        size="$5"
        renderItem={(item) => (
          <YStack gap="$1">
            <Text fontWeight="600">{item.name}</Text>
            <Text fontSize="$2" color="$color10">
              {item.subtitle}
            </Text>
          </YStack>
        )}
      />
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
      <Button size="$5" onPress={() => onSearch({ query, city })}>
        Cerca
      </Button>
    </YStack>
  );
}
