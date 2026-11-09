import { Text, XStack } from "tamagui";
import type { ChipProps } from "./chipProps";
import { brand } from "./tokens";

export type { ChipProps } from "./chipProps";

/** Pill per categorie/keyword filtranti, con stato selected — brief §3. Il sito usa Chip.web.tsx (HTML semplice): se cambia qui, va cambiato anche lì. */
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
