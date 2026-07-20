import { useState } from "react";
import { Input, XStack, YStack } from "tamagui";
import { Button } from "./Button";

export type SearchBarProps = {
  onSearch: (params: { query: string; city: string }) => void;
  initialQuery?: string;
  initialCity?: string;
};

export function SearchBar({ onSearch, initialQuery = "", initialCity = "" }: SearchBarProps) {
  const [query, setQuery] = useState(initialQuery);
  const [city, setCity] = useState(initialCity);

  return (
    <YStack
      gap="$3"
      $gtSm={{ flexDirection: "row", alignItems: "center" }}
      backgroundColor="white"
      padding="$3"
      borderRadius="$6"
      shadowColor="$shadowColor"
      shadowRadius={20}
      shadowOpacity={0.15}
      elevation="$2"
    >
      <Input
        flex={2}
        size="$5"
        borderWidth={0}
        placeholder="Cosa cerchi? Es. Idraulico, Elettricista..."
        value={query}
        onChangeText={setQuery}
        onSubmitEditing={() => onSearch({ query, city })}
      />
      <XStack width={1} height="60%" backgroundColor="$borderColor" display="none" $gtSm={{ display: "flex" }} />
      <Input
        flex={1}
        size="$5"
        borderWidth={0}
        placeholder="Città"
        value={city}
        onChangeText={setCity}
        onSubmitEditing={() => onSearch({ query, city })}
      />
      <Button size="$5" onPress={() => onSearch({ query, city })}>
        Cerca
      </Button>
    </YStack>
  );
}
