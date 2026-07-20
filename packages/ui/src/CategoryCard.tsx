import { Card, Text, YStack } from "tamagui";

export type CategoryCardProps = {
  icon: string;
  label: string;
  onPress?: () => void;
};

export function CategoryCard({ icon, label, onPress }: CategoryCardProps) {
  return (
    <Card
      elevate
      bordered
      padding="$4"
      width={152}
      height={120}
      alignItems="center"
      justifyContent="center"
      onPress={onPress}
      pressStyle={{ scale: 0.97 }}
      hoverStyle={{ borderColor: "$blue8" }}
      cursor="pointer"
    >
      <YStack alignItems="center" gap="$2">
        <Text fontSize="$9">{icon}</Text>
        <Text fontSize="$3" fontWeight="600" textAlign="center">
          {label}
        </Text>
      </YStack>
    </Card>
  );
}
