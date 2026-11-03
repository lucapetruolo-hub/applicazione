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
      paddingHorizontal="3"
      paddingVertical="2"
      borderRadius={999}
      borderWidth={1}
      borderColor={selected ? brand.cianografia : brand.filetto}
      backgroundColor={`${selected ? brand.cianografiaVelo : brand.calce}${onPress ? ` press:${brand.cianografiaVelo}` : ""}`}
      cursor={onPress ? "pointer" : undefined}
      onPress={onPress}
      role={onPress ? "button" : undefined}
      aria-pressed={onPress ? selected : undefined}
      onKeyDown={
            onPress
              ? (event: unknown) => {
                  const keyEvent = event as { key?: string; preventDefault?: () => void };
                  if (keyEvent.key !== " " && keyEvent.key !== "Enter") return;
                  keyEvent.preventDefault?.();
                  onPress();
                }
              : undefined
          }
    >
      <Text fontSize={16} fontWeight="600" color={selected ? brand.cianografiaScuro : brand.grafite}>
        {children}
      </Text>
    </XStack>
  );
}
