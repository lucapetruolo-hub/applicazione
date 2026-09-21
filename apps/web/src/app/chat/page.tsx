"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ChatThreadSummary } from "@professionisti/shared";
import { Avatar, Button, EmptyState, Icon, Text, XStack, YStack, brand } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/lib/AuthContext";
import { subscribeRealtimeEvents } from "@/lib/realtimeBus";
import { SkeletonThreadRow } from "@/components/Skeleton";
import { ConversationView } from "@/components/ConversationView";
import { UnreadDot } from "@/components/UnreadDot";
import { mergeCounts, unreadThreadCounts } from "@/lib/notificationSections";
import { useDismissableUnreadCount } from "@/lib/useDismissableUnreadCount";

// Poll di riserva (richiesta esplicita dell'utente: rete di sicurezza per
// una disconnessione SSE momentanea, non più la sola fonte — CTO:
// "socket.io vs websocket vs alternative", vedi AuthContext/RealtimeService
// per il verdetto). Allungato rispetto a prima (era 15s, l'unica fonte
// allora): un evento realtimeBus già ricarica la lista quasi istantaneo.
const CHAT_POLL_MS = 45000;

// Stesso principio già in uso altrove nel progetto (MegaMenu — 860px,
// "spazio sufficiente per un desktop reale"): sopra questa soglia le due
// colonne stanno affiancate comodamente, sotto è più leggibile mostrare
// una sola vista alla volta.
const DESKTOP_MEDIA_QUERY = "(min-width: 860px)";

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
 * Inbox "Chat" — richiesta esplicita dell'utente: elenco (nome, ultimo
 * messaggio, orario) sulla colonna sinistra, click apre la conversazione
 * **inline** sul resto dello schermo (mai più un popup) e di default da
 * desktop è già aperta l'ultima conversazione. Da mobile resta una vista
 * alla volta: lista, poi la chat a schermo intero con una freccetta in
 * alto a sinistra per tornare indietro. `ConversationView` (estratto da
 * `TimelineModal`, che ora ne resta un thin wrapper solo per i popup
 * altrove nel sito) è lo stesso corpo di conversazione, qui montato senza
 * backdrop.
 */
export default function ChatPage() {
  const router = useRouter();
  const { user, token, isLoading, markNotificationsRead } = useAuth();
  const [threads, setThreads] = useState<ChatThreadSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Conteggio non letti per thread (stessa chiave composita già in uso in
  // /le-mie-richieste per la sezione "Inviata a") — poll di riserva +
  // push in tempo reale, mai sostituito ma sommato (mergeCounts), stesso
  // principio già in uso nelle altre pagine con pallini "Contatta/
  // Cronologia".
  const [threadUnreadCounts, setThreadUnreadCountsState] = useState<Map<string, number>>(new Map());
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const hasAutoSelectedRef = useRef(false);

  function reload() {
    if (!token) return;
    apiClient
      .myChatThreads(token)
      .then(setThreads)
      .catch((err) => setError(err instanceof Error ? err.message : "Errore nel caricamento delle conversazioni."));
  }
  useEffect(reload, [token]);

  function pollUnread() {
    if (!token) return;
    apiClient
      .unreadNotifications(token)
      .then((notifications) => {
        if (notifications.length === 0) return;
        setThreadUnreadCountsState((prev) => mergeCounts(prev, unreadThreadCounts(notifications)));
        // Un nuovo messaggio cambia anche l'anteprima (ultimo messaggio +
        // data/ora) mostrata in elenco, non solo il pallino — ricarica
        // l'elenco quando arriva qualcosa di nuovo.
        reload();
      })
      .catch(() => {})
      .finally(() => markNotificationsRead());
  }

  // Push in tempo reale (CTO — SSE): un nuovo messaggio o una nuova
  // notifica per QUALUNQUE thread di questo utente ricarica subito
  // l'elenco (anteprima + pallino aggiornati), senza aspettare il poll di
  // riserva sotto.
  useEffect(() => {
    return subscribeRealtimeEvents((event) => {
      if (event.kind === "chat_message" || event.kind === "notification") pollUnread();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    if (!token) return;
    pollUnread();
    const interval = setInterval(pollUnread, CHAT_POLL_MS);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, markNotificationsRead]);

  // "Di default da desktop si andrà ad aprire già l'ultimo messaggio"
  // (richiesta esplicita dell'utente) — solo da desktop: da mobile la
  // prima cosa mostrata resta sempre la lista, mai una conversazione
  // aperta senza che l'utente l'abbia scelta. Una sola volta (il primo
  // caricamento dei thread), mai riapplicato se l'utente ha già
  // selezionato/deselezionato qualcosa.
  useEffect(() => {
    if (hasAutoSelectedRef.current) return;
    if (!threads || threads.length === 0) return;
    if (typeof window === "undefined" || !window.matchMedia(DESKTOP_MEDIA_QUERY).matches) return;
    hasAutoSelectedRef.current = true;
    setSelectedKey(threadKey(threads[0]!));
  }, [threads]);

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

  const selectedThread = threads?.find((t) => threadKey(t) === selectedKey) ?? null;

  return (
    <YStack width="100%" alignItems="center" backgroundColor={brand.gesso}>
      <YStack width="100%" maxWidth={1200} paddingHorizontal="$4" paddingTop="$5" paddingBottom="$3" flexShrink={0}>
        <Text fontFamily="$heading" fontWeight="800" fontSize="$8" color={brand.grafite}>
          Chat
        </Text>
        {error ? (
          <Text color={brand.urgenza} paddingTop="$2">
            {error}
          </Text>
        ) : null}
      </YStack>

      <div className={`chat-shell${selectedThread ? " has-selection" : ""}`}>
        <div className="chat-list-pane">
          {threads === null ? (
            <YStack backgroundColor={brand.calce} borderRadius={16} overflow="hidden" margin="$4">
              {[0, 1, 2, 3].map((i) => (
                <SkeletonThreadRow key={i} zebra={i % 2 !== 0} />
              ))}
            </YStack>
          ) : threads.length === 0 ? (
            <YStack padding="$4">
              <EmptyState icon="message-circle" title="Nessuna conversazione" description="Le chat delle tue richieste e dei tuoi preventivi compariranno qui." />
            </YStack>
          ) : (
            <YStack backgroundColor={brand.calce} borderRadius={16} overflow="hidden" margin="$4">
              {threads.map((thread, index) => (
                <ChatThreadRow
                  key={threadKey(thread)}
                  thread={thread}
                  unreadCount={threadUnreadCounts.get(threadKey(thread))}
                  zebra={index % 2 !== 0}
                  active={threadKey(thread) === selectedKey}
                  onOpen={() => setSelectedKey(threadKey(thread))}
                  onGoToRequest={() => router.push(requestDestination(thread))}
                />
              ))}
            </YStack>
          )}
        </div>

        <div className="chat-conversation-pane">
          {selectedThread ? (
            <ConversationView
              key={threadKey(selectedThread)}
              token={token}
              guidedRequestId={selectedThread.guidedRequestId}
              professionalProfileId={selectedThread.professionalProfileId}
              viewerRole={selectedThread.viewerRole}
              otherPartyName={selectedThread.otherPartyName}
              otherPartyImageUrl={selectedThread.otherPartyImageUrl}
              onBack={() => {
                setSelectedKey(null);
                reload();
              }}
              backIcon="chevron-left"
            />
          ) : (
            <YStack flex={1} alignItems="center" justifyContent="center" padding="$6">
              <EmptyState icon="message-circle" title="Seleziona una conversazione" description="Scegli una chat dall'elenco per vedere i messaggi." />
            </YStack>
          )}
        </div>
      </div>

      {/* Layout a due colonne solo da desktop (richiesta esplicita
          dell'utente): sotto la soglia una vista alla volta (lista, poi la
          conversazione a schermo intero con la freccetta indietro già
          dentro ConversationView) — stesso principio "CSS puro per un
          layout che Tamagui non rende bene" già in uso altrove nel
          prodotto (ResultsListWithMap, MegaMenu). */}
      <style jsx>{`
        .chat-shell {
          display: flex;
          flex-direction: column;
          width: 100%;
          max-width: 1200px;
          height: calc(100vh - 190px);
          min-height: 420px;
        }
        .chat-list-pane {
          width: 100%;
          overflow-y: auto;
        }
        .chat-conversation-pane {
          display: none;
          width: 100%;
          flex: 1;
          min-height: 0;
        }
        .chat-shell.has-selection .chat-list-pane {
          display: none;
        }
        .chat-shell.has-selection .chat-conversation-pane {
          display: flex;
          flex-direction: column;
        }
        @media (min-width: 860px) {
          .chat-shell {
            flex-direction: row;
            border: 1px solid ${brand.filetto};
            border-radius: 16px;
            overflow: hidden;
            background: ${brand.calce};
          }
          .chat-list-pane {
            display: block !important;
            width: 340px;
            flex-shrink: 0;
            border-right: 1px solid ${brand.filetto};
          }
          .chat-conversation-pane {
            display: flex !important;
            flex-direction: column;
            flex: 1;
          }
        }
      `}</style>
    </YStack>
  );
}

function ChatThreadRow({
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
      gap="$3"
      paddingHorizontal="$3"
      paddingVertical="$3"
      backgroundColor={active ? brand.cianografiaVelo : zebra ? brand.gesso : "transparent"}
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
          stopPropagation per non aprire anche la conversazione allo
          stesso click, stesso pattern già in uso in ProfessionalCard per
          un controllo annidato dentro un elemento cliccabile più grande. */}
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
          onGoToRequest();
        }}
      >
        <Icon name="file-text" size={15} color={brand.grafite70} strokeWidth={1.5} />
      </XStack>
    </XStack>
  );
}
