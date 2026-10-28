"use client";

import { YStack } from "@professionisti/ui";
import { CategoryIcon, CATEGORY_ACCENT } from "./icons/CategoryIcons";

export type CategoryIconBadgeProps = {
  slug: string;
  size?: number;
  /** Larghezza sotto i 660px, se diversa da `size`. */
  mobileSize?: number;
  iconSize?: number;
  /** "portrait": rettangolo verticale 3:4 con angoli di 20px, come la foto (ProfessionalAvatar). */
  shape?: "circle" | "portrait";
};

/** Cerchio colorato (tinta per categoria) con l'icona a linee della categoria dentro. */
export function CategoryIconBadge({ slug, size = 48, mobileSize, iconSize, shape = "circle" }: CategoryIconBadgeProps) {
  const accent = CATEGORY_ACCENT[slug as keyof typeof CATEGORY_ACCENT] ?? { bg: "#E4E2DE", fg: "#45423D" };
  const portrait = shape === "portrait";
  const heightFor = (width: number) => (portrait ? Math.round((width * 4) / 3) : width);
  return (
    <YStack
      width={size}
      height={heightFor(size)}
      borderRadius={portrait ? 20 : size}
      backgroundColor={accent.bg}
      alignItems="center"
      justifyContent="center"
      flexShrink={0}
      $xs={mobileSize ? { width: mobileSize, height: heightFor(mobileSize), borderRadius: portrait ? 20 : mobileSize } : undefined}
    >
      <CategoryIcon slug={slug} size={iconSize ?? Math.round((mobileSize ? Math.min(size, mobileSize) : size) * 0.5)} color={accent.fg} />
    </YStack>
  );
}
