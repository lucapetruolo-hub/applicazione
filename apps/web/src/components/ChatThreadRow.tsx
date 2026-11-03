import Image from "next/image";
import type { ChatThreadSummary } from "@professionisti/shared";
import { Avatar, Icon, Text, XStack, YStack, brand } from "@professionisti/ui";
import { UnreadDot } from "@/components/UnreadDot";
import { useDismissableUnreadCount } from "@/lib/useDismissableUnreadCount";

function formatThreadTimestamp(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const time = date.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome" });
  if (date.toDateString() === now.toDateString()) return time;
  return `${date.toLocaleDateString("it-IT", { day: "numeric", month: "short", timeZone: "Europe/Rome" })} · ${time}`;
}

/** Lato della foto nella riga: uguale con e senza foto della richiesta, così i testi restano allineati. */
const PICTURE_SIZE = 56;
/** Foto della persona sopra la foto del lavoro: 30 px, abbastanza per riconoscerla anche dal telefono. */
const SMALL_AVATAR = 30;

/**
 * Foto della riga (docs/changelog/2026-11-03-foto-richiesta-nei-messaggi.md,
 * idea di Luca): con le foto nella richiesta, la prima grande (angoli 10 px) e
 * la foto dell'altra parte piccola sopra, in basso a destra; senza, solo la
 * foto dell'altra parte, come prima. Decorativa: nome e lavoro sono già scritti
 * accanto.
 */
function ThreadPicture({ thread }: { thread: ChatThreadSummary }) {
  if (!thread.requestPhotoUrl) {
    return (
      <YStack width={PICTURE_SIZE} height={PICTURE_SIZE} alignItems="center" justifyContent="center" flexShrink={0}>
        <Avatar name={thread.otherPartyName} imageUrl={thread.otherPartyImageUrl} size={48} />
      </YStack>
    );
  }
  return (
    <YStack width={PICTURE_SIZE} height={PICTURE_SIZE} flexShrink={0} position="relative">
      <YStack width={PICTURE_SIZE} height={PICTURE_SIZE} borderRadius={10} overflow="hidden" backgroundColor={brand.gesso}>
        <Image
          src={thread.requestPhotoUrl}
          alt=""
          width={PICTURE_SIZE}
          height={PICTURE_SIZE}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      </YStack>
      <YStack position="absolute" right={-7} bottom={-7} padding={2} borderRadius={(SMALL_AVATAR + 4) / 2} backgroundColor={brand.calce}>
        <Avatar name={thread.otherPartyName} imageUrl={thread.otherPartyImageUrl} size={SMALL_AVATAR} />
      </YStack>
    </YStack>
  );
}

export function ChatThreadRow({
  thread,
  unreadCount,
  zebra,
  active,
  onOpen,
  onGoToRequest,
}: {
  thread: ChatThreadSummary;
  unreadCount?: number;
  zebra: boolean;
  /** Evidenzia la riga della conversazione aperta (solo rilevante da desktop, dove la lista resta visibile accanto — richiesta implicita dal layout a due colonne: sapere quale chat si sta leggendo). */
  active: boolean;
  onOpen: () => void;
  onGoToRequest: () => void;
}) {
  // Il pallino deve sparire non appena si apre la conversazione (richiesta
  // esplicita dell'utente, stesso principio già in uso ovunque nel
  // prodotto) — vedi useDismissableUnreadCount.
  const [effectiveUnreadCount, dismissUnread] = useDismissableUnreadCount(unreadCount);
  const previewText = thread.lastMessage
    ? thread.lastMessage
    : thread.lastMessageHasMedia
      ? "Foto/video allegati"
      : "Nessun messaggio ancora";

  return (
    <XStack
      alignItems="center"
      gap="3"
      paddingHorizontal="3"
      paddingVertical="3"
      backgroundColor={active ? brand.cianografiaVelo : zebra ? brand.gesso : "transparent"}
      cursor="pointer"
      role="button"
      onPress={() => {
            onOpen();
            dismissUnread();
          }}
    >
      <ThreadPicture thread={thread} />
      <YStack flex={1} minWidth={0} gap={2}>
        <Text fontWeight="700" color={brand.grafite} numberOfLines={1}>
          {thread.otherPartyName}
        </Text>
        {/* Il lavoro (docs/CHANGELOG.md §198): due chat con la stessa persona
            non sembrano più uguali. Solo la descrizione, la categoria se manca
            (§349): "Idraulico · ..." tagliava proprio la parte che distingue. */}
        <Text fontSize={13} color={brand.grafite70} numberOfLines={1}>
          {thread.requestDescription?.trim() || thread.categoryLabel}
        </Text>
        <Text fontSize={16} color={brand.grafite70} numberOfLines={1}>
          {thread.lastMessageIsMine ? "Tu: " : ""}
          {previewText}
        </Text>
      </YStack>
      <YStack alignItems="flex-end" gap="1" flexShrink={0}>
        <Text fontSize={13} color={brand.grafite70}>
          {formatThreadTimestamp(thread.lastMessageAt)}
        </Text>
        <UnreadDot count={effectiveUnreadCount} />
      </YStack>
      {/* Link separato dall'apertura della chat (richiesta esplicita
          dell'utente: "dai la possibilità di andare alla pagina del
          preventivo/informazioni di quella determinata chat") —
          stopPropagation per non aprire anche la conversazione allo
          stesso click, stesso pattern già in uso in ProfessionalCard per
          un controllo annidato dentro un elemento cliccabile più grande. */}
      <XStack
        width={32}
        height={32}
        alignItems="center"
        justifyContent="center"
        borderRadius={10}
        backgroundColor={brand.gesso}
        cursor="pointer"
        flexShrink={0}
        role="button"
        aria-label="Vai alla richiesta"
        onPress={(e: { stopPropagation: () => void }) => {
          e.stopPropagation();
          onGoToRequest();
        }}
      >
        <Icon name="file-text" size={15} color={brand.grafite70} strokeWidth={1.5} />
      </XStack>
    </XStack>
  );
}
