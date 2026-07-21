"use client";

import { Card, Text, YStack } from "@professionisti/ui";
import { CategoryIconBadge } from "./CategoryIconBadge";

export function CategoryTile({ slug, label, onPress }: { slug: string; label: string; onPress?: () => void }) {
  return (
    <Card
      elevate
      bordered
      padding="$4"
      width={152}
      alignItems="center"
      justifyContent="center"
      gap="$3"
      onPress={onPress}
      cursor="pointer"
      animation="quick"
      scale={1}
      y={0}
      hoverStyle={{ scale: 1.04, y: -4, borderColor: "$blue8" }}
      pressStyle={{ scale: 0.97, y: 0 }}
    >
      <CategoryIconBadge slug={slug} size={52} />
      <Text fontSize="$3" fontWeight="600" textAlign="center">
        {label}
      </Text>
    </Card>
  );
}
