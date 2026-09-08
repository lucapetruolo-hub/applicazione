"use client";

import { useRouter } from "next/navigation";
import { Icon, Text, XStack, YStack, brand } from "@professionisti/ui";
import { useAuth } from "@/lib/AuthContext";
import { notificationDestination } from "@/lib/notificationSections";

function ToastCard({
  id,
  icon,
  message,
  type,
  onDismiss,
  onOpen,
}: {
  id: string;
  icon: string;
  message: string;
  type: string;
  onDismiss: (id: string) => void;
  onOpen: (type: string) => void;
}) {
  // Niente più sparizione automatica dopo pochi secondi (richiesta esplicita
  // dell'utente: "non è ben comprensibile, rendila visualizzabile fino a
  // che non si visualizza e apre effettivamente quell'aggiornamento") — il
  // banner resta a schermo finché non viene aperto (click sul corpo) o
  // chiuso esplicitamente con la "x", mai da solo.
  const destination = notificationDestination(type);

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
      onPress={() => {
        // Richiesta esplicita dell'utente: cliccare il banner deve aprire
        // l'aggiornamento a cui si riferisce, non solo chiuderlo — naviga
        // alla pagina/tab giusti (se il tipo di notifica ne conosce uno) e
        // lo chiude comunque, stesso effetto di prima per i tipi ignoti.
        if (destination) onOpen(type);
        onDismiss(id);
      }}
      accessibilityRole="button"
      accessibilityLabel={destination ? `${message} — tocca per aprire` : `${message} — tocca per chiudere`}
    >
      <Text fontSize={22} lineHeight={22}>
        {icon}
      </Text>
      <Text fontSize="$3" color={brand.grafite} fontWeight="600" flex={1}>
        {message}
      </Text>
      {/* Tasto di chiusura esplicito: senza sparizione automatica il
          banner non ha più un modo di andarsene da solo — questa "x"
          lo chiude senza aprire l'aggiornamento (stopPropagation, mai
          navigare dal solo tasto di chiusura). */}
      <XStack
        padding={4}
        cursor="pointer"
        onPress={(e: { stopPropagation: () => void }) => {
          e.stopPropagation();
          onDismiss(id);
        }}
        accessibilityRole="button"
        accessibilityLabel="Chiudi la notifica"
      >
        <Icon name="x" size={16} color={brand.grafite70} />
      </XStack>
    </XStack>
  );
}

/**
 * Popup "toast" per nuove notifiche (richiesta esplicita dell'utente:
 * "Fantastico, hai ricevuto un nuovo preventivo" / "Wow, hanno accettato
 * un tuo preventivo") — pila in alto al centro, si accumula se arrivano
 * più eventi ravvicinati. Resta a schermo finché non viene aperto (click
 * sul corpo, naviga all'aggiornamento) o chiuso esplicitamente con la "x"
 * — mai una sparizione automatica (richiesta esplicita dell'utente: 6s
 * erano troppo pochi per accorgersene e capire di cosa si trattava).
 * Montato una sola volta nel layout globale (come SiteHeader): i toast
 * restano visibili durante la navigazione tra pagine, non solo su
 * dashboard/le-mie-richieste.
 */
export function ToastStack() {
  const { toasts, dismissToast } = useAuth();
  const router = useRouter();

  if (toasts.length === 0) return null;

  function openNotification(type: string) {
    const destination = notificationDestination(type);
    if (!destination) return;
    router.push(`${destination.page}?tab=${destination.tab}`);
  }

  // `position="fixed"` non è un valore tipizzato per il prop `position` di
  // Tamagui (React Native non lo supporta) — stesso limite già documentato
  // per l'header sticky (SiteHeader.tsx) e ResultsListWithMap.tsx: un `<div>`
  // grezzo con lo style fixed, lo stack di toast vero resta uno YStack
  // Tamagui al suo interno.
  return (
    <div style={{ position: "fixed", top: 16, left: 0, right: 0, zIndex: 2000, display: "flex", justifyContent: "center", pointerEvents: "none" }}>
      <YStack alignItems="center" gap="$2" pointerEvents="box-none">
        {toasts.map((toast) => (
          <ToastCard key={toast.id} id={toast.id} icon={toast.icon} message={toast.message} type={toast.type} onDismiss={dismissToast} onOpen={openNotification} />
        ))}
      </YStack>
    </div>
  );
}
