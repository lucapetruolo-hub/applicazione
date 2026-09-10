"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiClient } from "@/lib/apiClient";
import { Icon, Text, XStack, YStack, brand, radiusDoc } from "@professionisti/ui";
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
        <Text fontSize={18} lineHeight={20}>
          {copy.icon}
        </Text>
        <YStack flex={1} flexBasis={0} gap={2} paddingRight={20}>
          <Text fontSize="$2" color={brand.grafite} fontWeight={isUnread ? "700" : "500"}>
            {copy.message}
          </Text>
          <Text fontSize="$1" color={brand.grafite70}>
            {timeAgo(item.createdAt)}
          </Text>
        </YStack>
        {isUnread ? <YStack width={8} height={8} borderRadius={999} backgroundColor={brand.cianografia} marginTop={6} /> : null}
      </XStack>
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
          <YStack
            position="absolute"
            top={2}
            right={2}
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
        <YStack
          maxHeight={420}
          overflow="hidden"
          backgroundColor={brand.calce}
          borderRadius={radiusDoc}
          shadowColor="rgba(43,32,19,0.12)"
          shadowRadius={16}
          shadowOffset={{ width: 0, height: 6 }}
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
            <Text fontFamily="$body" fontWeight="700" fontSize="$3" color={brand.grafite}>
              Notifiche
            </Text>
            {history && history.length > 0 ? (
              <XStack cursor="pointer" onPress={handleDeleteAll} accessibilityRole="button" accessibilityLabel="Elimina tutte le notifiche">
                <Text fontSize="$1" fontWeight="600" color={brand.grafite70}>
                  Elimina tutte
                </Text>
              </XStack>
            ) : null}
          </XStack>
          <YStack maxHeight={360} overflow="scroll">
            {isLoading ? (
              <Text padding="$4" fontSize="$2" color={brand.grafite70}>
                Caricamento...
              </Text>
            ) : !history || history.length === 0 ? (
              <Text padding="$4" fontSize="$2" color={brand.grafite70}>
                Nessuna notifica per ora.
              </Text>
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
