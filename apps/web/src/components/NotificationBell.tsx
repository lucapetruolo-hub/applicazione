"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiClient } from "@/lib/apiClient";
import { Icon, Text, XStack, YStack, brand, radiusDoc } from "@professionisti/ui";
import { useAuth } from "@/lib/AuthContext";
import { notificationCopy } from "@/lib/notificationCopy";
import { notificationDestination } from "@/lib/notificationSections";

type HistoryItem = { id: string; type: string; payload: unknown; createdAt: string; readAt: string | null };

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
 * Pulsante a campanella nell'header, cronologia notifiche (richiesta
 * esplicita dell'utente: "di fianco al nome... una campanella dove
 * conterrà la cronologia delle notifiche, e cliccando su una di quella
 * notifiche ti portera all oggetto in questione" — posizionato "alla
 * sinistra del nome" per chiarimento successivo). Distinto dal numeretto
 * già esistente su AccountMenu (quello copre solo le non lette con un
 * conteggio aggregato per pagina; questo mostra la cronologia intera,
 * lette comprese, con testo/icona per singolo evento via
 * `notificationCopy`) — stesso endpoint `GET /notifications/history`
 * (nuovo, `NotificationsService.history`, mai esposto prima: solo
 * `unread-count`/`unread`/`mark-all-read` esistevano).
 */
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
      // Aprire la campanella conta come averle viste, stesso principio
      // "visualizzare = confermare" già seguito ovunque nel prodotto
      // (es. /dashboard segna letto al mount) — azzera anche il numeretto
      // già esistente su AccountMenu, non solo questo pulsante.
      if (unreadCount > 0) void markNotificationsRead();
    }
  }

  function handleItemClick(item: HistoryItem) {
    setIsOpen(false);
    const destination = notificationDestination(item.type);
    if (destination) router.push(`${destination.page}?tab=${destination.tab}`);
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
        <YStack
          position="absolute"
          top="100%"
          left={0}
          marginTop="$2"
          width={340}
          maxWidth="90vw"
          maxHeight={420}
          overflow="hidden"
          backgroundColor={brand.calce}
          borderRadius={radiusDoc}
          zIndex={1000}
          shadowColor="rgba(43,32,19,0.12)"
          shadowRadius={16}
          shadowOffset={{ width: 0, height: 6 }}
          shadowOpacity={1}
        >
          <XStack paddingHorizontal="$4" paddingVertical="$3" borderBottomWidth={1} borderBottomColor={brand.filetto}>
            <Text fontFamily="$body" fontWeight="700" fontSize="$3" color={brand.grafite}>
              Notifiche
            </Text>
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
              history.map((item) => {
                const copy = notificationCopy(item.type);
                const isUnread = item.readAt === null;
                const destination = notificationDestination(item.type);
                return (
                  <XStack
                    key={item.id}
                    paddingHorizontal="$4"
                    paddingVertical="$3"
                    gap="$3"
                    alignItems="flex-start"
                    borderBottomWidth={1}
                    borderBottomColor={brand.filetto}
                    backgroundColor={isUnread ? brand.gesso : "transparent"}
                    cursor={destination ? "pointer" : "default"}
                    hoverStyle={destination ? { backgroundColor: brand.gesso } : undefined}
                    onPress={destination ? () => handleItemClick(item) : undefined}
                    accessibilityRole={destination ? "button" : undefined}
                    accessibilityLabel={destination ? `${copy.message} — apri` : copy.message}
                  >
                    <Text fontSize={18} lineHeight={20}>
                      {copy.icon}
                    </Text>
                    <YStack flex={1} flexBasis={0} gap={2}>
                      <Text fontSize="$2" color={brand.grafite} fontWeight={isUnread ? "700" : "500"}>
                        {copy.message}
                      </Text>
                      <Text fontSize="$1" color={brand.grafite70}>
                        {timeAgo(item.createdAt)}
                      </Text>
                    </YStack>
                    {isUnread ? <YStack width={8} height={8} borderRadius={999} backgroundColor={brand.cianografia} marginTop={6} /> : null}
                  </XStack>
                );
              })
            )}
          </YStack>
        </YStack>
      ) : null}
    </YStack>
  );
}
