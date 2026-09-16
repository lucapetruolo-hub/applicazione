"use client";

import { useState } from "react";
import Image from "next/image";
import { Surface, Text, YStack, brand, motionEasing, motionFast } from "@professionisti/ui";
import { CategoryIconBadge } from "./CategoryIconBadge";
import { CATEGORY_PHOTOS } from "@/lib/categoryPhotos";

export type CategoryTileProps = {
  slug: string;
  label: string;
  /** Numero reale di professionisti in questa categoria — mai un dato finto. */
  count?: number;
  onPress?: () => void;
};

/**
 * Card categoria per la griglia homepage: icona in alto a sinistra, hover
 * con leggero sollevamento + rotazione (brief "Vicinato", CLAUDE.md §19 —
 * sostituisce il bordo che si sposta di "Scheda Intervento", coerente con
 * l'ombra soffice ora di default su `Surface`).
 *
 * Stato "Disponibile"/"In arrivo" al posto del conteggio "N professionisti"
 * — richiesta esplicita dell'utente: un conteggio basso (es. "1
 * professionista") comunicava un sito vuoto invece che una comunità in
 * crescita. Sempre presente (mai omesso): "Disponibile" (verde, stesso
 * token semantico già usato per "Verificato") se almeno un professionista
 * reale è iscritto in questa categoria, "In arrivo" (grigio neutro)
 * altrimenti — mai un numero, quindi nessun rischio di sembrare "vuoto" a
 * un solo iscritto.
 */
export function CategoryTile({ slug, label, count, onPress }: CategoryTileProps) {
  const [hovered, setHovered] = useState(false);
  const photoUrl = CATEGORY_PHOTOS[slug];

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
      {photoUrl ? (
        // Foto reale al posto dell'icona colorata — richiesta esplicita
        // dell'utente per questa categoria specifica, stesso slot/dimensione
        // dell'icona per non alterare il layout della tile. `CATEGORY_PHOTOS`
        // (apps/web/src/lib/categoryPhotos.ts) resta vuota per le categorie
        // senza una foto fornita: quelle continuano a mostrare l'icona.
        <YStack width={44} height={44} borderRadius={44} overflow="hidden" flexShrink={0}>
          <Image src={photoUrl} alt="" width={44} height={44} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        </YStack>
      ) : (
        <CategoryIconBadge slug={slug} size={44} />
      )}
      <YStack gap={2}>
        <Text fontFamily="$body" fontSize={17} fontWeight="700" color={brand.grafite}>
          {label}
        </Text>
        {count ? (
          <Text fontFamily="$body" fontSize={12.5} fontWeight="600" color={brand.verificato}>
            Disponibile
          </Text>
        ) : null}
      </YStack>
    </Surface>
  );
}
