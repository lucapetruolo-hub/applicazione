"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ChatThreadSummary } from "@professionisti/shared";
import { Avatar, Button, EmptyState, Icon, Text, XStack, YStack, brand } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/lib/AuthContext";
import { LoadingState } from "@/components/LoadingState";
import { TimelineModal } from "@/components/TimelineModal";
import { UnreadDot } from "@/components/UnreadDot";
import { mergeCounts, unreadThreadCounts } from "@/lib/notificationSections";
import { useDismissableUnreadCount } from "@/lib/useDismissableUnreadCount";

// Stesso intervallo/motivo già in uso per gli altri pallini di notifica
// (apps/web/src/app/dashboard/page.tsx).
const CHAT_POLL_MS = 15000;

function threadKey(thread: ChatThreadSummary): string {
  return `${thread.guidedRequestId}:${thread.professionalProfileId}`;
}

/**
 * Pagina del preventivo/richiesta a cui questo thread si riferisce
 * (richiesta esplicita dell'utente: "dai la possibilità di andare alla
 * pagina del preventivo/informazioni di quella determinata chat") —
 * `?open=<guidedRequestId>` apre e scrolla alla card giusta su quella
 * pagina (vedi l'effetto dedicato in entrambi i file).
 */
function requestDestination(thread: ChatThreadSummary): string {
  return thread.viewerRole === "PROFESSIONAL" ? `/dashboard/richieste?open=${thread.guidedRequestId}` : `/le-mie-richieste?open=${thread.guidedRequestId}`;
}

function formatThreadTimestamp(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const time = date.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
  if (date.toDateString() === now.toDateString()) return time;
  return `${date.toLocaleDateString("it-IT", { day: "numeric", month: "short" })} · ${time}`;
}

/**
 * Inbox "Chat" (richiesta esplicita dell'utente: "aggiungi un menu Chat,
 * dove saranno presenti tutte le chat di tutti i preventivi, dove appena
 * clicchi sul menu ci sarà solo il nome del cliente o professionista con
 * l'ultimo messaggio ricevuto/inviato; e poi cliccando apparirà la chat
 * completa con tutti i messaggi e aggiornamenti") — un thread è la stessa
 * coppia (richiesta guidata, professionista) già usata da `TimelineModal`
 * ovunque nel sito, qui elencata per tutte le richieste dell'utente invece
 * di essere raggiungibile solo da dentro ciascuna card/richiesta. La chat
 * completa aperta al click è lo stesso `TimelineModal` già esistente
 * (real-time via poll, cronologia completa) — nessun componente duplicato.
 */
export default function ChatPage() {
  const { user, token, isLoading, markNotificationsRead } = useAuth();
  const [threads, setThreads] = useState<ChatThreadSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Conteggio non letti per thread (stessa chiave composita già in uso in
  // /le-mie-richieste per la sezione "Inviata a") — poll periodico, mai
  // sostituito ma sommato (mergeCounts), stesso principio già in uso nelle
  // altre pagine con pallini "Contatta/Cronologia".
  const [threadUnreadCounts, setThreadUnreadCountsState] = useState<Map<string, number>>(new Map());
  const [openThread, setOpenThread] = useState<ChatThreadSummary | null>(null);

  function reload() {
    if (!token) return;
    apiClient
      .myChatThreads(token)
      .then(setThreads)
      .catch((err) => setError(err instanceof Error ? err.message : "Errore nel caricamento delle conversazioni."));
  }
  useEffect(reload, [token]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    function poll() {
      apiClient
        .unreadNotifications(token!)
        .then((notifications) => {
          if (cancelled || notifications.length === 0) return;
          setThreadUnreadCountsState((prev) => mergeCounts(prev, unreadThreadCounts(notifications)));
          // Un nuovo messaggio cambia anche l'anteprima (ultimo messaggio +
          // data/ora) mostrata in elenco, non solo il pallino — ricarica
          // l'elenco quando arriva qualcosa di nuovo.
          reload();
        })
        .catch(() => {})
        .finally(() => markNotificationsRead());
    }
    poll();
    const interval = setInterval(poll, CHAT_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, markNotificationsRead]);

  if (isLoading) return null;

  if (!user || !token) {
    return (
      <YStack width="100%" alignItems="center" backgroundColor={brand.gesso} paddingVertical="$9" paddingHorizontal="$4">
        <YStack width="100%" maxWidth={480} gap="$4" alignItems="center">
          <Text fontFamily="$heading" fontWeight="800" fontSize="$7" color={brand.grafite} textAlign="center">
            Accedi per vedere le tue conversazioni
          </Text>
          <Link href="/accedi?redirect=/chat" style={{ textDecoration: "none" }}>
            <Button variant="primary">Accedi</Button>
          </Link>
        </YStack>
      </YStack>
    );
  }

  return (
    <YStack width="100%" alignItems="center" backgroundColor={brand.gesso} paddingVertical="$8" paddingHorizontal="$4">
      <YStack width="100%" maxWidth={640} gap="$5">
        <Text fontFamily="$heading" fontWeight="800" fontSize="$8" color={brand.grafite}>
          Chat
        </Text>

        {error ? <Text color={brand.urgenza}>{error}</Text> : null}

        {threads === null ? (
          <LoadingState />
        ) : threads.length === 0 ? (
          <EmptyState icon="message-circle" title="Nessuna conversazione" description="Le chat delle tue richieste e dei tuoi preventivi compariranno qui." />
        ) : (
          <YStack backgroundColor={brand.calce} borderRadius={16} overflow="hidden">
            {threads.map((thread, index) => (
              <ChatThreadRow
                key={threadKey(thread)}
                thread={thread}
                unreadCount={threadUnreadCounts.get(threadKey(thread))}
                zebra={index % 2 !== 0}
                onOpen={() => setOpenThread(thread)}
              />
            ))}
          </YStack>
        )}
      </YStack>

      {openThread ? (
        <TimelineModal
          token={token}
          guidedRequestId={openThread.guidedRequestId}
          professionalProfileId={openThread.professionalProfileId}
          viewerRole={openThread.viewerRole}
          otherPartyName={openThread.otherPartyName}
          onClose={() => {
            setOpenThread(null);
            reload();
          }}
        />
      ) : null}
    </YStack>
  );
}

function ChatThreadRow({
  thread,
  unreadCount,
  zebra,
  onOpen,
}: {
  thread: ChatThreadSummary;
  unreadCount?: number;
  zebra: boolean;
  onOpen: () => void;
}) {
  // Il pallino deve sparire non appena si apre la conversazione (richiesta
  // esplicita dell'utente, stesso principio già in uso ovunque nel
  // prodotto) — vedi useDismissableUnreadCount.
  const [effectiveUnreadCount, dismissUnread] = useDismissableUnreadCount(unreadCount);
  const router = useRouter();
  const previewText = thread.lastMessage
    ? thread.lastMessage
    : thread.lastMessageHasMedia
      ? "Foto/video allegati"
      : "Nessun messaggio ancora";

  return (
    <XStack
      alignItems="center"
      gap="$3"
      paddingHorizontal="$3"
      paddingVertical="$3"
      backgroundColor={zebra ? brand.gesso : "transparent"}
      cursor="pointer"
      accessibilityRole="button"
      onPress={() => {
        onOpen();
        dismissUnread();
      }}
    >
      <Avatar name={thread.otherPartyName} imageUrl={thread.otherPartyImageUrl} size={48} />
      <YStack flex={1} minWidth={0} gap={2}>
        <XStack alignItems="center" gap="$2" flexWrap="wrap">
          <Text fontWeight="700" color={brand.grafite} numberOfLines={1}>
            {thread.otherPartyName}
          </Text>
          <Text fontSize="$2" color={brand.grafite70}>
            · {thread.categoryLabel}
          </Text>
        </XStack>
        <Text fontSize="$3" color={brand.grafite70} numberOfLines={1}>
          {thread.lastMessageIsMine ? "Tu: " : ""}
          {previewText}
        </Text>
      </YStack>
      <YStack alignItems="flex-end" gap="$1" flexShrink={0}>
        <Text fontSize="$2" color={brand.grafite70}>
          {formatThreadTimestamp(thread.lastMessageAt)}
        </Text>
        <UnreadDot count={effectiveUnreadCount} />
      </YStack>
      {/* Link separato dall'apertura della chat (richiesta esplicita
          dell'utente: "dai la possibilità di andare alla pagina del
          preventivo/informazioni di quella determinata chat") —
          stopPropagation per non aprire anche il popup chat allo stesso
          click, stesso pattern già in uso in ProfessionalCard per un
          controllo annidato dentro un elemento cliccabile più grande. */}
      <XStack
        width={32}
        height={32}
        alignItems="center"
        justifyContent="center"
        borderRadius={8}
        backgroundColor={brand.gesso}
        cursor="pointer"
        flexShrink={0}
        accessibilityRole="button"
        accessibilityLabel="Vai alla richiesta"
        onPress={(e: { stopPropagation: () => void }) => {
          e.stopPropagation();
          router.push(requestDestination(thread));
        }}
      >
        <Icon name="file-text" size={15} color={brand.grafite70} strokeWidth={1.5} />
      </XStack>
    </XStack>
  );
}
