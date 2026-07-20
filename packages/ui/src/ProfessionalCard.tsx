import { Card, Text, XStack, YStack } from "tamagui";

export type ProfessionalCardProps = {
  businessName: string;
  categoryLabel: string;
  city: string;
  rating?: number;
  verified?: boolean;
  onPress?: () => void;
};

export function ProfessionalCard({
  businessName,
  categoryLabel,
  city,
  rating,
  verified,
  onPress,
}: ProfessionalCardProps) {
  return (
    <Card elevate bordered padding="$4" onPress={onPress} pressStyle={{ scale: 0.98 }}>
      <YStack gap="$1">
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
        {rating !== undefined ? <Text fontSize="$3">⭐ {rating.toFixed(1)}</Text> : null}
      </YStack>
    </Card>
  );
}
