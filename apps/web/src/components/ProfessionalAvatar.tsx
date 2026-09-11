"use client";

import Image from "next/image";
import { YStack } from "@professionisti/ui";
import { CategoryIconBadge } from "./CategoryIconBadge";

export type ProfessionalAvatarProps = {
  imageUrl: string | null;
  categorySlug: string;
  size?: number;
};

/** Immagine profilo del professionista se presente, altrimenti l'icona categoria colorata. */
export function ProfessionalAvatar({ imageUrl, categorySlug, size = 44 }: ProfessionalAvatarProps) {
  if (!imageUrl) {
    return <CategoryIconBadge slug={categorySlug} size={size} />;
  }

  return (
    <YStack width={size} height={size} borderRadius={size} overflow="hidden" flexShrink={0}>
      {/* `next/image` (dimensione nota in anticipo, `size`): lazy-loading e
          formati moderni automatici, a differenza del vecchio <img> grezzo. */}
      <Image src={imageUrl} alt="" width={size} height={size} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
    </YStack>
  );
}
