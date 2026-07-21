import type { ReactNode } from "react";
import { Card, Text, XStack, YStack } from "tamagui";

export type ProfessionalCardProps = {
  businessName: string;
  categoryLabel: string;
  city: string;
  rating?: number;
  verified?: boolean;
  remoteAvailable?: boolean;
  onPress?: () => void;
  /** Slot opzionale per un'icona/badge categoria (passato da chi consuma il componente, così l'icona custom resta web-only senza sporcare packages/ui). */
  icon?: ReactNode;
};

export function ProfessionalCard({
  businessName,
  categoryLabel,
  city,
  rating,
  verified,
  remoteAvailable,
  onPress,
  icon,
}: ProfessionalCardProps) {
  return (
    <Card
      elevate
      bordered
      padding="$4"
      onPress={onPress}
      cursor={onPress ? "pointer" : undefined}
      animation="quick"
      scale={1}
      y={0}
      hoverStyle={onPress ? { scale: 1.02, y: -3, borderColor: "$blue8" } : undefined}
      pressStyle={{ scale: 0.98, y: 0 }}
    >
      <XStack gap="$3" alignItems="flex-start">
        {icon}
        <YStack gap="$1" flex={1}>
          <XStack justifyContent="space-between" alignItems="center">
            <Text fontSize="$5" fontWeight="600">
              {businessName}
            </Text>
            {verified ? (
              <Text fontSize="$2" color="$blue10">
                Verificato
              </Text>
            ) : null}
          </XStack>
          <Text fontSize="$3" color="$color10">
            {categoryLabel} · {city}
          </Text>
          <XStack gap="$2" alignItems="center">
            {rating !== undefined ? <Text fontSize="$3">⭐ {rating.toFixed(1)}</Text> : null}
            {remoteAvailable ? (
              <Text fontSize="$2" color="$purple10" fontWeight="600">
                📹 Online
              </Text>
            ) : null}
          </XStack>
        </YStack>
      </XStack>
    </Card>
  );
}
