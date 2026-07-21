"use client";

import { YStack } from "@professionisti/ui";
import { CategoryIcon, CATEGORY_ACCENT } from "./icons/CategoryIcons";

export type CategoryIconBadgeProps = {
  slug: string;
  size?: number;
  iconSize?: number;
};

/** Cerchio colorato (tinta per categoria) con l'icona a linee della categoria dentro. */
export function CategoryIconBadge({ slug, size = 48, iconSize }: CategoryIconBadgeProps) {
  const accent = CATEGORY_ACCENT[slug as keyof typeof CATEGORY_ACCENT] ?? { bg: "#F1F5F9", fg: "#334155" };
  return (
    <YStack
      width={size}
      height={size}
      borderRadius={size}
      backgroundColor={accent.bg}
      alignItems="center"
      justifyContent="center"
      flexShrink={0}
    >
      <CategoryIcon slug={slug} size={iconSize ?? Math.round(size * 0.5)} color={accent.fg} />
    </YStack>
  );
}
