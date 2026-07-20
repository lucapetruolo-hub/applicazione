import { Card, Text, XStack, YStack } from "tamagui";

export type TestimonialCardProps = {
  authorName: string;
  authorRole?: string;
  text: string;
  rating?: number;
};

export function TestimonialCard({ authorName, authorRole, text, rating }: TestimonialCardProps) {
  return (
    <Card bordered padding="$4" backgroundColor="$color2">
      <YStack gap="$2">
        <XStack justifyContent="space-between" alignItems="center">
          <Text fontWeight="700">{authorName}</Text>
          {rating !== undefined ? (
            <Text color="$yellow10" fontSize="$3">
              {"★".repeat(rating)}
              {"☆".repeat(5 - rating)}
            </Text>
          ) : null}
        </XStack>
        <Text color="$color11" fontSize="$3">
          {text}
        </Text>
        {authorRole ? (
          <Text color="$color9" fontSize="$2" fontStyle="italic">
            {authorRole}
          </Text>
        ) : null}
      </YStack>
    </Card>
  );
}
