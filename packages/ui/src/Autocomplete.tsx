import { useState, type ReactNode } from "react";
import { Input, Text, YStack } from "tamagui";

export type AutocompleteProps<T> = {
  items: T[];
  getKey: (item: T) => string;
  getLabel: (item: T) => string;
  onSelect: (item: T) => void;
  renderItem?: (item: T) => ReactNode;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  maxResults?: number;
  size?: React.ComponentProps<typeof Input>["size"];
};

/**
 * Campo di testo con elenco a discesa filtrato in tempo reale, usato per la
 * ricerca professionisti/città (condiviso web+mobile).
 */
export function Autocomplete<T>({
  items,
  getKey,
  getLabel,
  onSelect,
  renderItem,
  value,
  onChangeText,
  placeholder,
  maxResults = 6,
  size,
}: AutocompleteProps<T>) {
  const [isFocused, setIsFocused] = useState(false);

  const normalizedQuery = value.trim().toLowerCase();
  const filtered = normalizedQuery
    ? items.filter((item) => getLabel(item).toLowerCase().includes(normalizedQuery)).slice(0, maxResults)
    : [];

  const showDropdown = isFocused && filtered.length > 0;

  return (
    <YStack position="relative" flex={1}>
      <Input
        flex={1}
        size={size}
        borderWidth={0}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setTimeout(() => setIsFocused(false), 150)}
      />
      {showDropdown ? (
        <YStack
          position="absolute"
          top="100%"
          left={0}
          right={0}
          marginTop="$2"
          backgroundColor="white"
          borderWidth={1}
          borderColor="$borderColor"
          borderRadius="$4"
          overflow="hidden"
          zIndex={1000}
          shadowColor="$shadowColor"
          shadowRadius={12}
          shadowOpacity={0.15}
        >
          {filtered.map((item) => (
            <YStack
              key={getKey(item)}
              padding="$3"
              borderBottomWidth={1}
              borderBottomColor="$borderColor"
              cursor="pointer"
              hoverStyle={{ backgroundColor: "$color3" }}
              onPress={() => onSelect(item)}
            >
              {renderItem ? renderItem(item) : <Text>{getLabel(item)}</Text>}
            </YStack>
          ))}
        </YStack>
      ) : null}
    </YStack>
  );
}
