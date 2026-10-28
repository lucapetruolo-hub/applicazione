"use client";

import Image from "next/image";
import { YStack } from "@professionisti/ui";
import { CategoryIconBadge } from "./CategoryIconBadge";

/** "circle": foto tonda; "portrait": rettangolo verticale 3:4 con angoli arrotondati. */
export type ProfessionalAvatarShape = "circle" | "portrait";

export type ProfessionalAvatarProps = {
  imageUrl: string | null;
  categorySlug: string;
  /** Larghezza in px (in "circle" anche l'altezza). */
  size?: number;
  /** Larghezza sotto i 660px, se diversa da `size`. */
  mobileSize?: number;
  shape?: ProfessionalAvatarShape;
};

/** Altezza della foto: uguale alla larghezza se tonda, 4/3 se verticale. */
export function avatarHeight(width: number, shape: ProfessionalAvatarShape): number {
  return shape === "portrait" ? Math.round((width * 4) / 3) : width;
}

/** Immagine profilo del professionista se presente, altrimenti l'icona categoria colorata. */
export function ProfessionalAvatar({ imageUrl, categorySlug, size = 44, mobileSize, shape = "circle" }: ProfessionalAvatarProps) {
  if (!imageUrl) {
    return <CategoryIconBadge slug={categorySlug} size={size} mobileSize={mobileSize} shape={shape} />;
  }

  const height = avatarHeight(size, shape);
  // Angoli del sito (10/20 px): 20 per la foto verticale.
  const radius = shape === "portrait" ? 20 : size;
  return (
    <YStack
      width={size}
      height={height}
      borderRadius={radius}
      overflow="hidden"
      flexShrink={0}
      $xs={mobileSize ? { width: mobileSize, height: avatarHeight(mobileSize, shape), borderRadius: shape === "portrait" ? 20 : mobileSize } : undefined}
    >
      {/* `next/image` (dimensione nota in anticipo, `size`): lazy-loading e
          formati moderni automatici, a differenza del vecchio <img> grezzo. */}
      <Image src={imageUrl} alt="" width={size} height={height} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
    </YStack>
  );
}
