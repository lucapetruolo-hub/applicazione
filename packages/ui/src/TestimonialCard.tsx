import { Card, Text, XStack, YStack } from "tamagui";
import { Icon } from "./Icon";
import { brand } from "./tokens";

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
            <XStack gap={2}>
              {[1, 2, 3, 4, 5].map((position) => (
                <Icon
                  key={position}
                  name="star"
                  size={14}
                  color={position <= rating ? brand.ottone : "#D6DAD5"}
                  fill={position <= rating ? brand.ottone : "none"}
                />
              ))}
            </XStack>
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
