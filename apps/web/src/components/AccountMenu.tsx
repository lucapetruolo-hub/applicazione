"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Avatar, Text, XStack, YStack, brand, radiusDoc } from "@professionisti/ui";
import { useAuth } from "@/lib/AuthContext";
import { getAccountMenuItems } from "@/lib/accountMenuItems";
import { accountMenuUnreadCounts } from "@/lib/notificationSections";

export function AccountMenu() {
  const { user, logout, unreadCount, unreadNotifications } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
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

  if (!user) return null;

  const items = getAccountMenuItems(user.role);

  // Richiesta esplicita dell'utente: un professionista è identificato dalla
  // propria attività, non dal nome dell'intestatario dell'account — un
  // cliente vede invece sempre il proprio nome come prima. `businessName`
  // resta `null` per un professionista che non ha ancora creato il
  // profilo (subito dopo la registrazione): ricade sul nome personale
  // finché non lo fa, invece di mostrare un'etichetta vuota.
  const displayName =
    user.role === "PROFESSIONAL" ? user.businessName ?? user.name ?? user.email : user.name ?? user.phone ?? user.email;
  // Richiesta esplicita dell'utente: l'icona in alto a destra mostra
  // l'immagine profilo pubblica del professionista (ProfessionalProfile.
  // imageUrl) quando disponibile, non le sole iniziali — `user.imageUrl`
  // (User.imageUrl) resta sempre null per un professionista, l'upload in
  // /account è disabilitato per quel ruolo.
  const displayImageUrl = user.role === "PROFESSIONAL" ? user.businessImageUrl ?? user.imageUrl : user.imageUrl;

  // Numeretto per voce di menu (richiesta esplicita dell'utente: oltre al
  // totale accanto al nome, deve comparire anche sulla voce del sottomenu
  // che porta alla pagina con la novità, es. "Dashboard"/"Le mie visite").
  const menuUnreadCounts = accountMenuUnreadCounts(user.role, unreadNotifications);

  return (
    <YStack ref={containerRef} position="relative">
      <YStack
        flexDirection="row"
        alignItems="center"
        gap="$1"
        cursor="pointer"
        onPress={() => setIsOpen((open) => !open)}
        accessibilityRole="button"
        accessibilityLabel={unreadCount > 0 ? `Il mio account, ${unreadCount} novità da visualizzare` : "Il mio account"}
      >
        <Avatar name={displayName ?? "?"} imageUrl={displayImageUrl} size={24} />
        <Text fontSize="$3" fontWeight="600" color={brand.grafite}>
          {displayName}
        </Text>
        {unreadCount > 0 ? (
          <YStack
            backgroundColor={brand.urgenza}
            borderRadius={999}
            minWidth={18}
            height={18}
            paddingHorizontal={4}
            alignItems="center"
            justifyContent="center"
          >
            <Text fontSize={11} fontWeight="700" color="white" lineHeight={14}>
              {unreadCount > 9 ? "9+" : unreadCount}
            </Text>
          </YStack>
        ) : null}
        <Text fontSize="$2" color={brand.grafite70}>
          {isOpen ? "▲" : "▼"}
        </Text>
      </YStack>

      {isOpen ? (
        <YStack
          position="absolute"
          top="100%"
          right={0}
          marginTop="$2"
          minWidth={220}
          backgroundColor={brand.calce}
          borderRadius={radiusDoc}
          overflow="hidden"
          zIndex={1000}
          shadowColor="rgba(43,32,19,0.05)"
          shadowRadius={20}
          shadowOffset={{ width: 0, height: 8 }}
          shadowOpacity={1}
        >
          {items.map((item) => {
            const itemUnreadCount = menuUnreadCounts[item.href] ?? 0;
            return (
              <Link key={item.href} href={item.href} style={{ textDecoration: "none" }} onClick={() => setIsOpen(false)}>
                <XStack
                  paddingHorizontal="$4"
                  paddingVertical="$3"
                  alignItems="center"
                  justifyContent="space-between"
                  gap="$2"
                  hoverStyle={{ backgroundColor: brand.gesso }}
                >
                  <Text fontSize="$3" color={brand.grafite}>
                    {item.label}
                  </Text>
                  {itemUnreadCount > 0 ? (
                    <YStack
                      backgroundColor={brand.urgenza}
                      borderRadius={999}
                      minWidth={18}
                      height={18}
                      paddingHorizontal={4}
                      alignItems="center"
                      justifyContent="center"
                    >
                      <Text fontSize={11} fontWeight="700" color="white" lineHeight={14}>
                        {itemUnreadCount > 9 ? "9+" : itemUnreadCount}
                      </Text>
                    </YStack>
                  ) : null}
                </XStack>
              </Link>
            );
          })}
          <YStack borderTopWidth={1} borderTopColor={brand.filetto}>
            <YStack
              paddingHorizontal="$4"
              paddingVertical="$3"
              cursor="pointer"
              hoverStyle={{ backgroundColor: brand.gesso }}
              onPress={() => {
                setIsOpen(false);
                logout();
              }}
              accessibilityRole="button"
              accessibilityLabel="Esci dal tuo account"
            >
              <Text fontSize="$3" color={brand.urgenza} fontWeight="600">
                Esci
              </Text>
            </YStack>
          </YStack>
        </YStack>
      ) : null}
    </YStack>
  );
}
