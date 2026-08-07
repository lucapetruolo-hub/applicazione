import { Card, Text, YStack } from "tamagui";
import { Icon, type IconName } from "./Icon";
import { brand } from "./tokens";

export type CategoryCardProps = {
  icon: IconName;
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
      hoverStyle={{ borderColor: brand.cianografia }}
      cursor="pointer"
    >
      <YStack alignItems="center" gap="$2">
        <Icon name={icon} size={28} color={brand.cianografia} strokeWidth={1.5} />
        <Text fontSize="$3" fontWeight="600" textAlign="center">
          {label}
        </Text>
      </YStack>
    </Card>
  );
}
