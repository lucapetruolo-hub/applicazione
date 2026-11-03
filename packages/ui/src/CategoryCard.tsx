import { Text, YStack } from "tamagui";
import { Icon, type IconName } from "./Icon";
import { brand } from "./tokens";

export type CategoryCardProps = {
  icon: IconName;
  label: string;
  onPress?: () => void;
};

export function CategoryCard({ icon, label, onPress }: CategoryCardProps) {
  return (
    // Stesso aspetto della Card di Tamagui 1 (`elevate`, `bordered`, tema
    // "Card"), scritto per intero: la Card di Tamagui 3 non ha più quelle
    // varianti (docs/changelog/2026-11-02-tamagui-3.md).
    <YStack
      backgroundColor="hsl(0, 0%, 96.3%)"
      borderRadius="4"
      borderWidth={1}
      boxShadow="0px 12px 24px shadowColor"
      padding="4"
      width={152}
      height={120}
      alignItems="center"
      justifyContent="center"
      scale="press:0.97"
      borderColor={`hsl(0,0%,90.0%) hover:${brand.cianografia}`}
      cursor="pointer"
      onPress={onPress}
    >
      <YStack alignItems="center" gap="2">
        <Icon name={icon} size={28} color={brand.cianografiaScuro} strokeWidth={1.5} />
        <Text fontSize={16} fontWeight="600" textAlign="center">
          {label}
        </Text>
      </YStack>
    </YStack>
  );
}
