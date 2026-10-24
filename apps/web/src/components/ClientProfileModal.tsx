"use client";

import { useEffect } from "react";
import { Avatar, Text, XStack, YStack, brand } from "@professionisti/ui";
import { closeOnBackdrop } from "@/lib/closeOnBackdrop";

/**
 * Scheda profilo del cliente, aperta cliccando il suo nome in una richiesta
 * ricevuta (`/dashboard/richieste`, `RequestCard`) — richiesta esplicita
 * dell'utente ("nelle richieste ricevute deve esserci anche il nome,
 * cliccando si aprirà la scheda profilo della persona"). Stesso pattern
 * overlay di BookingDetailPanel/PhotoLightbox (role="dialog", chiusura con
 * Escape/click sul backdrop, nessuna libreria aggiunta).
 *
 * Il cliente non ha un profilo pubblico in questo marketplace (solo i
 * professionisti ne hanno uno, /professionista/[id]): questa scheda mostra
 * solo l'identità (nome; cognome e foto profilo a preventivo accettato, §216) — richiesta
 * esplicita dell'utente, che ha ribaltato di nuovo la decisione di privacy
 * presa in un giro precedente (CLAUDE.md §12, mostrava telefono/email già
 * da qui): "tutte le info relative al cliente gli verranno visualizzate
 * solo ad accettazione del lavoro". Telefono/email/indirizzo non sono più
 * props di questo componente — restano disponibili solo dopo l'accettazione
 * del preventivo, mostrati direttamente nella sezione "Contatti" della
 * card di un lavoro accettato (già esistente, sorgente ProfessionalBooking),
 * non in questa scheda identità. Niente recensioni sul cliente: il
 * professionista non recensisce più il cliente (docs/CHANGELOG.md §215).
 */
export function ClientProfileModal({
  name,
  detailsUnlocked = false,
  imageUrl,
  onClose,
}: {
  name: string;
  /** Preventivo accettato: cognome e foto già sbloccati, la nota sotto non serve più. */
  detailsUnlocked?: boolean;
  /** Foto profilo dell'account cliente, se presente — richiesta esplicita dell'utente. */
  imageUrl?: string | null;
  onClose: () => void;
}) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div
      role="presentation"
      onClick={closeOnBackdrop(onClose)}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(20,24,30,0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1100, // sopra la finestra della conversazione (TimelineModal, 1000), da cui si apre cliccando il nome
        padding: 16,
      }}
    >
      <YStack
        role="dialog"
        aria-modal
        aria-label="Scheda cliente"
        width="100%"
        maxWidth={420}
        maxHeight="85vh"
        overflow="scroll"
        backgroundColor={brand.calce}
        borderRadius="$3"
        borderWidth={1}
        borderColor={brand.filetto}
        padding="$5"
        gap="$4"
        alignItems="center"
      >
        <XStack width="100%" justifyContent="flex-end">
          <Text fontSize="$5" color={brand.grafite70} cursor="pointer" onPress={onClose} accessibilityRole="button" accessibilityLabel="Chiudi">
            ✕
          </Text>
        </XStack>

        <Avatar name={name} imageUrl={imageUrl ?? null} size={72} />

        <YStack gap="$1" alignItems="center">
          <Text fontFamily="$heading" fontWeight="800" fontSize="$6" color={brand.grafite} textAlign="center">
            {name}
          </Text>
          <Text fontFamily="$body" fontWeight="700" fontSize={13} color={brand.grafite70}>
            Cliente
          </Text>
        </YStack>

        {detailsUnlocked ? null : (
          <Text fontSize={13} color={brand.grafite70} textAlign="center">
            Cognome, foto, telefono, email e indirizzo saranno visibili all&apos;accettazione del preventivo.
          </Text>
        )}
      </YStack>
    </div>
  );
}
