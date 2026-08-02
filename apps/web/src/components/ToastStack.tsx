"use client";

import { useEffect } from "react";
import { Text, XStack, YStack, brand } from "@professionisti/ui";
import { useAuth } from "@/lib/AuthContext";

const AUTO_DISMISS_MS = 6000;

function ToastCard({ id, icon, message, onDismiss }: { id: string; icon: string; message: string; onDismiss: (id: string) => void }) {
  useEffect(() => {
    const timer = setTimeout(() => onDismiss(id), AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  return (
    <XStack
      alignItems="center"
      gap="$3"
      paddingHorizontal="$4"
      paddingVertical="$3"
      backgroundColor={brand.calce}
      borderWidth={1}
      borderColor={brand.filetto}
      borderRadius="$3"
      shadowColor="rgba(20,24,30,0.2)"
      shadowRadius={16}
      shadowOffset={{ width: 0, height: 4 }}
      maxWidth={360}
      cursor="pointer"
      onPress={() => onDismiss(id)}
      accessibilityRole="button"
      accessibilityLabel={`${message} — tocca per chiudere`}
    >
      <Text fontSize={22} lineHeight={22}>
        {icon}
      </Text>
      <Text fontSize="$3" color={brand.grafite} fontWeight="600" flex={1}>
        {message}
      </Text>
    </XStack>
  );
}

/**
 * Popup "toast" per nuove notifiche (richiesta esplicita dell'utente:
 * "Fantastico, hai ricevuto un nuovo preventivo" / "Wow, hanno accettato
 * un tuo preventivo") — pila in alto al centro, si accumula se arrivano
 * più eventi ravvicinati, ogni toast si chiude da solo dopo 6s o al click.
 * Montato una sola volta nel layout globale (come SiteHeader): i toast
 * restano visibili durante la navigazione tra pagine, non solo su
 * dashboard/le-mie-richieste.
 */
export function ToastStack() {
  const { toasts, dismissToast } = useAuth();

  if (toasts.length === 0) return null;

  // `position="fixed"` non è un valore tipizzato per il prop `position` di
  // Tamagui (React Native non lo supporta) — stesso limite già documentato
  // per l'header sticky (SiteHeader.tsx) e ResultsListWithMap.tsx: un `<div>`
  // grezzo con lo style fixed, lo stack di toast vero resta uno YStack
  // Tamagui al suo interno.
  return (
    <div style={{ position: "fixed", top: 16, left: 0, right: 0, zIndex: 2000, display: "flex", justifyContent: "center", pointerEvents: "none" }}>
      <YStack alignItems="center" gap="$2" pointerEvents="box-none">
        {toasts.map((toast) => (
          <ToastCard key={toast.id} id={toast.id} icon={toast.icon} message={toast.message} onDismiss={dismissToast} />
        ))}
      </YStack>
    </div>
  );
}
