import { Text, XStack } from "tamagui";
import type { BadgeProps, BadgeVariant } from "./badgeProps";
import { brand } from "./tokens";

export type { BadgeProps, BadgeVariant } from "./badgeProps";

const VARIANT_STYLE: Record<BadgeVariant, { bg: string; fg: string }> = {
  // Colori semantici: terracotta solo sul segno di fiducia "Verificato",
  // verde sulle cose attive o fatte, ottone solo su elementi a pagamento, rosso
  // solo sul flusso urgenza (docs/changelog/2026-11-11-palette-e-figtree.md).
  verificato: { bg: brand.terracottaVelo, fg: brand.terracotta },
  fatto: { bg: brand.cianografiaVelo, fg: brand.verificato },
  // ottoneScuro: l'ottone pieno sul suo velo era 1,9:1, illeggibile.
  pro: { bg: "#F5EEE0", fg: brand.ottoneScuro },
  urgente: { bg: "#FDE8E6", fg: brand.urgenza },
  nuovo: { bg: brand.cianografiaVelo, fg: brand.cianografiaScuro },
};

/**
 * Etichetta di stato — cinque varianti fisse, nessun colore libero. Pillola
 * piena (non più mono maiuscolo hairline, brief "Vicinato" CLAUDE.md §19):
 * il mono resta solo per cifre tabulari altrove, qui basta il colore
 * semantico a dare peso. Il sito usa Badge.web.tsx (HTML semplice): se cambia
 * qui, va cambiato anche lì.
 */
export function Badge({ variant, children }: BadgeProps) {
  const { bg, fg } = VARIANT_STYLE[variant];
  return (
    <XStack paddingHorizontal="3" paddingVertical={5} borderRadius={999} backgroundColor={bg} alignSelf="flex-start">
      <Text fontFamily="body" fontSize={13} fontWeight="700" color={fg}>
        {children}
      </Text>
    </XStack>
  );
}
