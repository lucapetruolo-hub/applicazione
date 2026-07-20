import { Paragraph, Text, YStack } from "tamagui";

export type IconFeatureProps = {
  icon: string;
  title: string;
  description: string;
};

export function IconFeature({ icon, title, description }: IconFeatureProps) {
  return (
    <YStack alignItems="center" gap="$2" maxWidth={280} padding="$3">
      <Text fontSize="$9">{icon}</Text>
      <Text fontSize="$5" fontWeight="700" textAlign="center">
        {title}
      </Text>
      <Paragraph textAlign="center" color="$color10" size="$3">
        {description}
      </Paragraph>
    </YStack>
  );
}
