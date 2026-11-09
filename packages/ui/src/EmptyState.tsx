import { Paragraph, Text, YStack } from "tamagui";
import type { EmptyStateProps } from "./emptyStateProps";
import { Icon } from "./Icon";
import { brand } from "./tokens";

export type { EmptyStateProps } from "./emptyStateProps";

/** Icona + titolo + azione — mai testo triste senza via d'uscita (brief §3). Il sito usa EmptyState.web.tsx (HTML semplice): se cambia qui, va cambiato anche lì. */
export function EmptyState({ icon, title, description, action, illustration }: EmptyStateProps) {
  return (
    <YStack alignItems="center" gap="3" paddingVertical="8" paddingHorizontal="4">
      <YStack
        width={56}
        height={56}
        borderRadius={28}
        backgroundColor={brand.cianografiaVelo}
        alignItems="center"
        justifyContent="center"
      >
        {illustration ?? <Icon name={icon} size={26} color={brand.cianografiaScuro} strokeWidth={1.5} />}
      </YStack>
      <Text fontFamily="heading" fontWeight="700" fontSize="5" textAlign="center" color={brand.grafite}>
        {title}
      </Text>
      {description ? (
        <Paragraph textAlign="center" color={brand.grafite70} maxWidth={360}>
          {description}
        </Paragraph>
      ) : null}
      {action}
    </YStack>
  );
}
