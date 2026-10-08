"use client";

import { Text, XStack } from "@professionisti/ui";
import { CardButton } from "@/components/CardButton";
import { UnreadDot } from "@/components/UnreadDot";

/**
 * Pulsante "Contatta/Cronologia" (apre la conversazione e la storia della richiesta) con il pallino dei non letti,
 * uguale per cliente e professionista nelle richieste — richiesta esplicita
 * dell'utente di farlo sembrare un pulsante e di non chiamarlo più "Chat"
 * (docs/CHANGELOG.md §187). La sua misura è quella di tutti i pulsanti in
 * fondo alle schede (`CardButton`, docs/CHANGELOG.md §195).
 */
export function ContactButton({ onPress, unreadCount, compact }: { onPress: () => void; unreadCount?: number; compact?: boolean }) {
  return (
    <CardButton tone="primary" compact={compact} alignSelf="flex-start" onPress={onPress}>
      <XStack alignItems="center" gap="$1">
        <Text color="white" fontFamily="$body" fontWeight="600" fontSize={compact ? "$2" : "$3"}>
          Contatta/Cronologia
        </Text>
        <UnreadDot count={unreadCount} />
      </XStack>
    </CardButton>
  );
}
