"use client";

import { CategoryIcon, CATEGORY_ACCENT } from "./icons/CategoryIcons";
import { photoBox, photoBoxStyles } from "./photoBoxStyle";

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
  // HTML semplice, non Tamagui: compare in ogni scheda delle pagine città
  // (docs/changelog/2026-11-09-pagine-pubbliche-senza-tamagui.md).
  const box = photoBox(
    { width: size, height: heightFor(size), radius: portrait ? 20 : size },
    mobileSize ? { width: mobileSize, height: heightFor(mobileSize), radius: portrait ? 20 : mobileSize } : undefined,
  );
  return (
    <div className={`${box.className} ${photoBoxStyles.centered}`} style={{ ...box.style, backgroundColor: accent.bg }}>
      <CategoryIcon slug={slug} size={iconSize ?? Math.round((mobileSize ? Math.min(size, mobileSize) : size) * 0.5)} color={accent.fg} />
    </div>
  );
}
