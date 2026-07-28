import type { ReactNode } from "react";
import { Paragraph, Text, YStack } from "tamagui";
import { Icon, type IconName } from "./Icon";
import { brand } from "./tokens";

export type EmptyStateProps = {
  icon: IconName;
  title: string;
  description?: string;
  action?: ReactNode;
};

/** Icona + titolo + azione — mai testo triste senza via d'uscita (brief §3). */
export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <YStack alignItems="center" gap="$3" paddingVertical="$8" paddingHorizontal="$4">
      <YStack
        width={56}
        height={56}
        borderRadius={28}
        backgroundColor={brand.cianografiaVelo}
        alignItems="center"
        justifyContent="center"
      >
        <Icon name={icon} size={26} color={brand.cianografia} strokeWidth={1.5} />
      </YStack>
      <Text fontFamily="$heading" fontWeight="700" fontSize="$5" textAlign="center" color={brand.grafite}>
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
