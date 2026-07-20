import { Text, XStack } from "tamagui";

export type CategoryChip = {
  key: string;
  label: string;
};

export type CategoryChipsProps = {
  items: CategoryChip[];
  onPress?: (key: string) => void;
};

export function CategoryChips({ items, onPress }: CategoryChipsProps) {
  return (
    <XStack flexWrap="wrap" gap="$2" justifyContent="center">
      {items.map((item) => (
        <XStack
          key={item.key}
          paddingHorizontal="$3"
          paddingVertical="$2"
          borderRadius="$10"
          borderWidth={1}
          borderColor="$borderColor"
          backgroundColor="white"
          pressStyle={{ backgroundColor: "$color3" }}
          cursor="pointer"
          onPress={() => onPress?.(item.key)}
        >
          <Text fontSize="$3">{item.label}</Text>
        </XStack>
      ))}
    </XStack>
  );
}
