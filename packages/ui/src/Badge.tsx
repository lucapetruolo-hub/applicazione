import type { ReactNode } from "react";
import { Text, XStack } from "tamagui";
import { brand } from "./tokens";

export type BadgeVariant = "verificato" | "pro" | "urgente" | "nuovo";

const VARIANT_STYLE: Record<BadgeVariant, { bg: string; fg: string }> = {
  // Colori semantici: verde solo su verificato/conferma, ottone solo su
  // elementi a pagamento, rosso solo sul flusso urgenza (CLAUDE.md/brief §1.2).
  verificato: { bg: "#E6F4EC", fg: brand.verificato },
  pro: { bg: "#F5EEE0", fg: brand.ottone },
  urgente: { bg: "#FBEAE8", fg: brand.urgenza },
  nuovo: { bg: brand.cianografiaVelo, fg: brand.cianografia },
};

export type BadgeProps = {
  variant: BadgeVariant;
  children: ReactNode;
};

/** Etichetta di stato — brief §3, quattro varianti fisse, nessun colore libero. */
export function Badge({ variant, children }: BadgeProps) {
  const { bg, fg } = VARIANT_STYLE[variant];
  return (
    <XStack paddingHorizontal="$2" paddingVertical={3} borderRadius="$2" backgroundColor={bg} alignSelf="flex-start">
      <Text fontFamily="$mono" fontSize={11} fontWeight="500" letterSpacing={0.5} textTransform="uppercase" color={fg}>
        {children}
      </Text>
    </XStack>
  );
}
