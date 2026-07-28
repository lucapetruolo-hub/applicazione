import type { ReactNode } from "react";
import { Text, XStack } from "tamagui";
import { brand } from "./tokens";

export type ChipProps = {
  children: ReactNode;
  selected?: boolean;
  onPress?: () => void;
};

/** Pill per categorie/keyword filtranti, con stato selected — brief §3. */
export function Chip({ children, selected = false, onPress }: ChipProps) {
  return (
    <XStack
      paddingHorizontal="$3"
      paddingVertical="$2"
      borderRadius={999}
      borderWidth={1}
      borderColor={selected ? brand.cianografia : brand.filetto}
      backgroundColor={selected ? brand.cianografiaVelo : brand.calce}
      cursor={onPress ? "pointer" : undefined}
      onPress={onPress}
      pressStyle={onPress ? { backgroundColor: brand.cianografiaVelo } : undefined}
    >
      <Text fontSize="$3" fontWeight="600" color={selected ? brand.cianografia : brand.grafite}>
        {children}
      </Text>
    </XStack>
  );
}
