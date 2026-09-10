"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiClient } from "@/lib/apiClient";
import { Icon, Text, XStack, YStack, brand, radiusDocLg } from "@professionisti/ui";
import { useAuth } from "@/lib/AuthContext";
import { notificationCopy } from "@/lib/notificationCopy";
import { notificationDeepLink } from "@/lib/notificationSections";

type HistoryItem = { id: string; type: string; payload: unknown; createdAt: string; readAt: string | null };

const SWIPE_DELETE_THRESHOLD_PX = 70;

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "adesso";
  if (minutes < 60) return `${minutes} min fa`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? "ora" : "ore"} fa`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} ${days === 1 ? "giorno" : "giorni"} fa`;
  return new Date(iso).toLocaleDateString("it-IT", { day: "numeric", month: "short" });
}

/**
 * Riga di una singola notifica — eliminabile in due modi (richiesta
 * esplicita dell'utente): un piccolo pulsante "x" in alto a destra, o uno
 * swipe orizzontale sulla riga stessa. Lo swipe segue lo stesso principio
 * già in uso in `CalendarShell.tsx` (solo `onTouchStart`/`onTouchEnd`, mai
 * `preventDefault`, così lo scroll verticale della lista resta intatto) —
 * qui la traccia viene invece seguita anche durante il gesto
 * (`onTouchMove`, per dare un feedback visivo di trascinamento), ma senza
 * mai bloccare lo scroll verticale del contenitore (nessun `preventDefault`,
 * e la soglia di eliminazione è puramente orizzontale).
 */
function NotificationRow({
  item,
  onOpen,
  onDelete,
}: {
  item: HistoryItem;
  onOpen: (item: HistoryItem) => void;
  onDelete: (id: string) => void;
}) {
  const [dragX, setDragX] = useState(0);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const draggingRef = useRef(false);

  const copy = notificationCopy(item.type);
  const isUnread = item.readAt === null;
  const destination = notificationDeepLink(item.type, item.payload);

  function handleTouchStart(e: React.TouchEvent) {
    const touch = e.touches[0];
    if (!touch) return;
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
    draggingRef.current = false;
  }

  function handleTouchMove(e: React.TouchEvent) {
    const start = touchStartRef.current;
    const touch = e.touches[0];
    if (!start || !touch) return;
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    // Attiva il trascinamento solo se il gesto è chiaramente orizzontale
    // (stesso principio di dominanza asse già in uso in CalendarShell, per
    // non confliggere con lo scroll verticale della lista).
    if (!draggingRef.current && Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      draggingRef.current = true;
    }
    if (draggingRef.current) {
      setDragX(dx);
    }
  }

  function handleTouchEnd() {
    if (draggingRef.current && Math.abs(dragX) > SWIPE_DELETE_THRESHOLD_PX) {
      onDelete(item.id);
    }
    setDragX(0);
    touchStartRef.current = null;
    draggingRef.current = false;
  }

  // Handler touch sul `<div>` grezzo, non su `XStack` — stesso principio già
  // documentato per `CalendarShell.tsx`: gli eventi touch nativi restano più
  // affidabili su un nodo DOM diretto piuttosto che passati attraverso il
  // layer react-native-web di Tamagui.
  return (
    <div
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      style={{
        position: "relative",
        transform: dragX !== 0 ? `translateX(${dragX}px)` : undefined,
        transition: dragX === 0 ? "transform 0.15s ease" : undefined,
      }}
    >
      <XStack
        paddingHorizontal="$4"
        paddingVertical="$3"
        gap="$3"
        alignItems="flex-start"
        borderBottomWidth={1}
        borderBottomColor={brand.filetto}
        backgroundColor={isUnread ? brand.gesso : "transparent"}
        cursor={destination ? "pointer" : "default"}
        hoverStyle={destination ? { backgroundColor: brand.gesso } : undefined}
        onPress={destination ? () => onOpen(item) : undefined}
        accessibilityRole={destination ? "button" : undefined}
        accessibilityLabel={destination ? `${copy.message} — apri` : copy.message}
      >
        {/* Icona in un chip colorato invece del solo emoji isolato — resa
            più "da app moderna" (richiesta esplicita dell'utente), lo
            stesso principio già in uso per le icone categoria colorate
            altrove nel prodotto. */}
        <YStack
          width={36}
          height={36}
          borderRadius={999}
          alignItems="center"
          justifyContent="center"
          backgroundColor={isUnread ? brand.cianografiaVelo : brand.gesso}
          flexShrink={0}
        >
          <Text fontSize={17} lineHeight={19}>
            {copy.icon}
          </Text>
        </YStack>
        <YStack flex={1} flexBasis={0} gap={2} paddingRight={20}>
          <Text fontSize="$2" color={brand.grafite} fontWeight={isUnread ? "700" : "500"}>
            {copy.message}
          </Text>
          <Text fontSize="$1" color={brand.grafite70}>
            {timeAgo(item.createdAt)}
          </Text>
        </YStack>
        {isUnread ? <YStack width={7} height={7} borderRadius={999} backgroundColor={brand.cianografia} marginTop={7} /> : null}
      </XStack>
      {/* Accento a sinistra sulle non lette — sostituisce il solo sfondo
          tinto come unico indizio di "non letta", più riconoscibile a
          colpo d'occhio in una lista scorrevole. */}
      {isUnread ? (
        <YStack position="absolute" top={0} bottom={0} left={0} width={3} backgroundColor={brand.cianografia} />
      ) : null}
      {/* Pulsante di eliminazione — richiesta esplicita dell'utente: "un
          piccolo pulsante in alto a destra per ogni notifica", oltre allo
          swipe già gestito sopra sulla riga intera. */}
      <XStack
        position="absolute"
        top={6}
        right={6}
        padding={4}
        cursor="pointer"
        onPress={(e: { stopPropagation: () => void }) => {
          e.stopPropagation();
          onDelete(item.id);
        }}
        accessibilityRole="button"
        accessibilityLabel="Elimina questa notifica"
      >
        <Icon name="x" size={13} color={brand.grafite70} />
      </XStack>
    </div>
  );
}

export function NotificationBell() {
  const { token, unreadCount, markNotificationsRead } = useAuth();
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [history, setHistory] = useState<HistoryItem[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  if (!token) return null;

  async function handleToggle() {
    const next = !isOpen;
    setIsOpen(next);
    if (next) {
      setIsLoading(true);
      try {
        const items = await apiClient.notificationHistory(token as string);
        setHistory(items);
      } catch {
        setHistory([]);
      } finally {
        setIsLoading(false);
      }
      if (unreadCount > 0) void markNotificationsRead();
    }
  }

  function handleItemClick(item: HistoryItem) {
    setIsOpen(false);
    const destination = notificationDeepLink(item.type, item.payload);
    if (destination) router.push(destination);
  }

  async function handleDelete(id: string) {
    setHistory((prev) => (prev ? prev.filter((item) => item.id !== id) : prev));
    try {
      await apiClient.deleteNotification(token as string, id);
    } catch {
      // Silenzioso, stesso principio già seguito altrove per operazioni non
      // critiche: se la richiesta fallisce la notifica ricompare al
      // prossimo giro di apertura del dropdown, nessun blocco dell'UI.
    }
  }

  /** Elimina tutte le notifiche in un colpo (richiesta esplicita dell'utente). */
  async function handleDeleteAll() {
    setHistory([]);
    try {
      await apiClient.deleteAllNotifications(token as string);
    } catch {
      // Stesso principio di handleDelete: silenzioso, nessun blocco dell'UI.
    }
  }

  return (
    <YStack ref={containerRef} position="relative">
      <XStack
        position="relative"
        alignItems="center"
        justifyContent="center"
        width={36}
        height={36}
        borderRadius={999}
        cursor="pointer"
        hoverStyle={{ backgroundColor: brand.gesso }}
        onPress={handleToggle}
        accessibilityRole="button"
        accessibilityLabel={unreadCount > 0 ? `Notifiche, ${unreadCount} non lette` : "Notifiche"}
      >
        <Icon name="bell-ring" size={20} color={brand.grafite} />
        {unreadCount > 0 ? (
          // Anello pulsante attorno al pallino (richiesta esplicita
          // dell'utente, resa più "da sito di ultima generazione"): un
          // `<div>` grezzo per la keyframe animation (globals.css), non
          // ottenibile con le sole prop Tamagui.
          <div className="notification-bell-ping" style={{ position: "absolute", top: 2, right: 2, borderRadius: 999 }}>
            <YStack
              backgroundColor={brand.urgenza}
              borderRadius={999}
              minWidth={16}
              height={16}
              paddingHorizontal={3}
              alignItems="center"
              justifyContent="center"
            >
              <Text fontSize={10} fontWeight="700" color="white" lineHeight={12}>
                {unreadCount > 9 ? "9+" : unreadCount}
              </Text>
            </YStack>
          </div>
        ) : null}
      </XStack>

      {isOpen ? (
        // Bug reale corretto (segnalazione utente: "da mobile esce fuori lo
        // schermo"): `right:0` era relativo al solo contenitore 36x36 della
        // campanella, non al vero bordo destro del viewport — la campanella
        // non è l'ultimo elemento dell'header (AccountMenu sta ancora più a
        // destra, CLAUDE.md §71), quindi un pannello largo 340px poteva
        // sforare abbondantemente il bordo sinistro su schermi stretti.
        // `.notification-bell-panel` (globals.css) passa a `position:fixed`
        // con `left`/`right` fissi sotto 480px, ancorato al vero viewport
        // indipendentemente da dove sta la campanella nell'header.
        <div className="notification-bell-panel" style={{ width: 340, maxWidth: "90vw", zIndex: 1000 }}>
        {/* Pannello ridisegnato in stile "vetro smerigliato" (richiesta
            esplicita dell'utente: "rendilo più innovativo come i siti di
            ultima generazione") — sfondo bianco translucido +
            `backdrop-filter: blur` (classe CSS, non esprimibile con le
            sole prop Tamagui) invece del bianco pieno di prima, ingresso
            animato (scala + dissolvenza) invece di comparire di scatto,
            angoli più morbidi (radiusDocLg) e ombra più profonda/diffusa. */}
        <YStack
          className="notification-bell-panel-inner"
          maxHeight={440}
          overflow="hidden"
          backgroundColor="rgba(255,255,255,0.86)"
          borderRadius={radiusDocLg}
          borderWidth={1}
          borderColor="rgba(255,255,255,0.6)"
          shadowColor="rgba(43,32,19,0.18)"
          shadowRadius={28}
          shadowOffset={{ width: 0, height: 12 }}
          shadowOpacity={1}
        >
          <XStack
            paddingHorizontal="$4"
            paddingVertical="$3"
            borderBottomWidth={1}
            borderBottomColor={brand.filetto}
            alignItems="center"
            justifyContent="space-between"
          >
            <XStack alignItems="center" gap="$2">
              <YStack width={26} height={26} borderRadius={999} alignItems="center" justifyContent="center" backgroundColor={brand.cianografiaVelo}>
                <Icon name="bell-ring" size={13} color={brand.cianografia} />
              </YStack>
              <Text fontFamily="$body" fontWeight="700" fontSize="$3" color={brand.grafite}>
                Notifiche
              </Text>
            </XStack>
            {history && history.length > 0 ? (
              <XStack cursor="pointer" onPress={handleDeleteAll} accessibilityRole="button" accessibilityLabel="Elimina tutte le notifiche">
                <Text fontSize="$1" fontWeight="600" color={brand.grafite70}>
                  Elimina tutte
                </Text>
              </XStack>
            ) : null}
          </XStack>
          <YStack maxHeight={380} overflow="scroll">
            {isLoading ? (
              <Text padding="$4" fontSize="$2" color={brand.grafite70}>
                Caricamento...
              </Text>
            ) : !history || history.length === 0 ? (
              <YStack padding="$5" alignItems="center" gap="$2">
                <Text fontSize={26} lineHeight={30}>
                  🔔
                </Text>
                <Text fontSize="$2" color={brand.grafite70} textAlign="center">
                  Nessuna notifica per ora.
                </Text>
              </YStack>
            ) : (
              history.map((item) => <NotificationRow key={item.id} item={item} onOpen={handleItemClick} onDelete={handleDelete} />)
            )}
          </YStack>
        </YStack>
        </div>
      ) : null}
    </YStack>
  );
}
