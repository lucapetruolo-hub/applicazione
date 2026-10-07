"use client";

import { Button, Text, XStack } from "@professionisti/ui";
import { UnreadDot } from "@/components/UnreadDot";

/**
 * Pulsante "Contatta/Cronologia" (apre la conversazione e la storia della richiesta) con il pallino dei non letti,
 * uguale per cliente e professionista nelle richieste — richiesta esplicita
 * dell'utente di farlo sembrare un pulsante e di non chiamarlo più "Chat"
 * (docs/CHANGELOG.md §187).
 */
export function ContactButton({ onPress, unreadCount, compact }: { onPress: () => void; unreadCount?: number; compact?: boolean }) {
  return (
    <Button variant="primary" size={compact ? "$2" : "$3"} height={compact ? 36 : 40} alignSelf="flex-start" onPress={onPress}>
      <XStack alignItems="center" gap="$1">
        <Text color="white" fontFamily="$body" fontWeight="600" fontSize={compact ? "$2" : "$3"}>
          Contatta/Cronologia
        </Text>
        <UnreadDot count={unreadCount} />
      </XStack>
    </Button>
  );
}
