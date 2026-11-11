import { Text, XStack } from "tamagui";
import type { BadgeProps, BadgeVariant } from "./badgeProps";
import { brand } from "./tokens";

export type { BadgeProps, BadgeVariant } from "./badgeProps";

const VARIANT_STYLE: Record<BadgeVariant, { bg: string; fg: string }> = {
  // Colori semantici: verde solo su verificato/conferma, ottone solo su
  // elementi a pagamento, rosso solo sul flusso urgenza (CLAUDE.md/brief §1.2).
  verificato: { bg: brand.terracottaVelo, fg: brand.terracotta },
  pro: { bg: "#F5EEE0", fg: brand.ottone },
  urgente: { bg: "#FDE8E6", fg: brand.urgenza },
  nuovo: { bg: brand.cianografiaVelo, fg: brand.cianografiaScuro },
};

/**
 * Etichetta di stato — quattro varianti fisse, nessun colore libero. Pillola
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
