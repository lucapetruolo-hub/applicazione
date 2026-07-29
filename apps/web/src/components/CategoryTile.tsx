"use client";

import { useState } from "react";
import { Surface, Text, YStack, brand, motionEasing, motionFast } from "@professionisti/ui";
import { CategoryIconBadge } from "./CategoryIconBadge";

export type CategoryTileProps = {
  slug: string;
  label: string;
  /** Numero reale di professionisti in questa categoria — riga mono omessa se assente/zero (brief §4.3: mai un dato finto). */
  count?: number;
  onPress?: () => void;
};

/**
 * Card categoria per la griglia homepage (brief redesign §4.3): icona in
 * alto a sinistra (non centrata), hover che sposta bordo+icona invece di
 * sollevare la card con ombra (coerente con "ombre quasi assenti" del
 * brief). Riga "N professionisti" solo se il conteggio reale è > 0.
 */
export function CategoryTile({ slug, label, count, onPress }: CategoryTileProps) {
  const [hovered, setHovered] = useState(false);

  return (
    <Surface
      width={152}
      minHeight={132}
      alignItems="flex-start"
      justifyContent="center"
      gap="$3"
      onPress={onPress}
      cursor="pointer"
      accessibilityRole="button"
      borderColor={hovered ? brand.cianografia : brand.filetto}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      style={{
        transition: `border-color ${motionFast} ${motionEasing}, transform ${motionFast} ${motionEasing}`,
        transform: hovered ? "translateX(2px)" : "none",
      }}
    >
      <YStack style={{ transition: `transform ${motionFast} ${motionEasing}`, transform: hovered ? "translateX(2px)" : "none" }}>
        <CategoryIconBadge slug={slug} size={44} />
      </YStack>
      <YStack gap={2}>
        <Text fontFamily="$body" fontSize={17} fontWeight="600" color={brand.grafite}>
          {label}
        </Text>
        {count ? (
          <Text fontFamily="$mono" fontSize={11} letterSpacing={0.4} color={brand.grafite70} textTransform="uppercase">
            {count} professionist{count === 1 ? "a" : "i"}
          </Text>
        ) : null}
      </YStack>
    </Surface>
  );
}
