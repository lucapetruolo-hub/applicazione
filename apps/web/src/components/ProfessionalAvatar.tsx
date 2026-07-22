"use client";

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
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={imageUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
    </YStack>
  );
}
