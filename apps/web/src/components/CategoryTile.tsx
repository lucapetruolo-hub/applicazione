"use client";

import { useState } from "react";
import { Surface, Text, YStack, brand, motionEasing, motionFast } from "@professionisti/ui";
import { CategoryIconBadge } from "./CategoryIconBadge";

export type CategoryTileProps = {
  slug: string;
  label: string;
  /** Numero reale di professionisti in questa categoria — riga omessa se assente/zero (mai un dato finto). */
  count?: number;
  onPress?: () => void;
};

/**
 * Card categoria per la griglia homepage: icona in alto a sinistra, hover
 * con leggero sollevamento + rotazione (brief "Vicinato", CLAUDE.md §19 —
 * sostituisce il bordo che si sposta di "Scheda Intervento", coerente con
 * l'ombra soffice ora di default su `Surface`). Riga "N professionisti"
 * solo se il conteggio reale è > 0.
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
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      style={{
        transition: `transform ${motionFast} ${motionEasing}, box-shadow ${motionFast} ${motionEasing}`,
        transform: hovered ? "translateY(-4px) rotate(-1deg)" : "none",
      }}
    >
      <CategoryIconBadge slug={slug} size={44} />
      <YStack gap={2}>
        <Text fontFamily="$body" fontSize={17} fontWeight="700" color={brand.grafite}>
          {label}
        </Text>
        {count ? (
          <Text fontFamily="$body" fontSize={12.5} fontWeight="600" color={brand.grafite70}>
            {count} professionist{count === 1 ? "a" : "i"}
          </Text>
        ) : null}
      </YStack>
    </Surface>
  );
}
