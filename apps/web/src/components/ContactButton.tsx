"use client";

import { Icon, Text, XStack, brand } from "@professionisti/ui";
import { CardButton } from "@/components/CardButton";
import { UnreadDot } from "@/components/UnreadDot";

/**
 * Pulsante "Messaggi" (apre la conversazione e la storia della richiesta; prima "Contatta/Cronologia") con il pallino dei non letti,
 * uguale per cliente e professionista nelle richieste — richiesta esplicita
 * dell'utente di farlo sembrare un pulsante e di non chiamarlo più "Chat"
 * (docs/CHANGELOG.md §187). La sua misura è quella di tutti i pulsanti in
 * fondo alle schede (`CardButton`, docs/CHANGELOG.md §195).
 */
export function ContactButton({
  onPress,
  unreadCount,
  compact,
  compactOnPhone,
  light,
}: {
  onPress: () => void;
  unreadCount?: number;
  compact?: boolean;
  compactOnPhone?: boolean;
  /**
   * "Messaggi" leggero accanto al nome, per le schede dove la scelta
   * principale è un'altra (preventivo del cliente, docs/CHANGELOG.md §338).
   */
  light?: boolean;
}) {
  if (light) {
    return (
      // Da telefono solo l'icona tonda, così sta sulla riga del nome.
      <CardButton aria-label="Messaggi" paddingHorizontal="16px xs:0px" width="xs:44px" onPress={onPress}>
        <XStack alignItems="center" gap="2">
          <Icon name="message-circle" size={18} color={brand.grafite} />
          <Text color={brand.grafite} fontFamily="body" fontWeight="600" fontSize="3" display="xs:none">
            Messaggi
          </Text>
          {/* Da telefono il pallino sta sull'angolo dell'icona. */}
          <XStack position="xs:absolute" top="xs:-6px" right="xs:-10px">
            <UnreadDot count={unreadCount} />
          </XStack>
        </XStack>
      </CardButton>
    );
  }
  // "Messaggi" con bordo (docs/CHANGELOG.md §349): "Contatta/Cronologia"
  // con la barra non era una parola, e pieno verde competeva con l'azione
  // principale della scheda (Invia preventivo, Lavoro terminato).
  return (
    <CardButton compact={compact} compactOnPhone={compactOnPhone} alignSelf="flex-start" onPress={onPress}>
      <XStack alignItems="center" gap="2">
        <Icon name="message-circle" size={compact ? 16 : 18} color={brand.grafite} />
        <Text color={brand.grafite} fontFamily="body" fontWeight="600" fontSize={compact ? "2" : compactOnPhone ? "3 xs:13px" : "3"}>
          Messaggi
        </Text>
        <UnreadDot count={unreadCount} />
      </XStack>
    </CardButton>
  );
}
