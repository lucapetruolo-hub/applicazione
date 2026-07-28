import { Paragraph, Text, YStack } from "tamagui";
import { Icon, type IconName } from "./Icon";
import { brand } from "./tokens";

export type IconFeatureProps = {
  icon: IconName;
  title: string;
  description: string;
};

export function IconFeature({ icon, title, description }: IconFeatureProps) {
  return (
    <YStack alignItems="center" gap="$2" maxWidth={280} padding="$3">
      <Icon name={icon} size={32} color={brand.cianografia} strokeWidth={1.5} />
      <Text fontSize="$5" fontWeight="700" textAlign="center">
        {title}
      </Text>
      <Paragraph textAlign="center" color="$color10" size="$3">
        {description}
      </Paragraph>
    </YStack>
  );
}
