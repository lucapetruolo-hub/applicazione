"use client";

import { Text, YStack, brand } from "@professionisti/ui";
import { CardButton } from "./CardButton";

/** Dal terzo giro di proposte senza accordo si invita a scriversi in chat. */
export const DATE_ROUNDS_HINT_FROM = 3;

/**
 * Proposte di data che rimbalzano senza accordo
 * (docs/changelog/2026-11-18-sposta-e-terminato-in-anticipo.md): dal terzo
 * giro, una riga che invita a mettersi d'accordo in chat, uguale per cliente
 * e professionista.
 */
export function DateRoundsHint({ rounds, onMessage }: { rounds: number | undefined; onMessage?: (() => void) | null }) {
  if (!rounds || rounds < DATE_ROUNDS_HINT_FROM) return null;
  return (
    <YStack gap="2" padding="3" borderRadius={10} backgroundColor={brand.cianografiaVelo} data-testid="date-rounds-hint">
      <Text fontSize={14} color={brand.grafite} lineHeight="19px">
        Non riuscite a trovare una data? Scrivetevi in chat, mettetevi d&apos;accordo e poi proponete quella.
      </Text>
      {onMessage ? (
        <CardButton compact alignSelf="flex-start" onPress={onMessage}>
          Scrivi in chat
        </CardButton>
      ) : null}
    </YStack>
  );
}
