"use client";

import { useEffect } from "react";
import { Avatar, Text, XStack, YStack, brand } from "@professionisti/ui";

/**
 * Scheda profilo minimale del cliente, aperta cliccando il suo nome in una
 * richiesta ricevuta ancora senza preventivo (`/dashboard`, `LeadCard`) —
 * richiesta esplicita dell'utente ("nelle richieste ricevute deve esserci
 * anche il nome, cliccando si aprirà la scheda profilo della persona").
 * Stesso pattern overlay di BookingDetailPanel/PhotoLightbox (role="dialog",
 * chiusura con Escape/click sul backdrop, nessuna libreria aggiunta).
 *
 * Il cliente non ha un profilo pubblico in questo marketplace (solo i
 * professionisti ne hanno uno, /professionista/[id]): questa scheda mostra
 * solo il nome. Telefono/email/indirizzo restano visibili solo dopo
 * l'accettazione del preventivo (ProfessionalBooking, AcceptedJobCard) —
 * decisione di privacy già presa in CLAUDE.md §12, non ribaltata qui.
 */
export function ClientProfileModal({ name, onClose }: { name: string; onClose: () => void }) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Scheda cliente"
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
        zIndex: 1000,
        padding: 16,
      }}
    >
      <YStack
        onPress={(e: { stopPropagation: () => void }) => e.stopPropagation()}
        width="100%"
        maxWidth={360}
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

        <Avatar name={name} size={72} />

        <YStack gap="$1" alignItems="center">
          <Text fontFamily="$heading" fontWeight="800" fontSize="$6" color={brand.grafite} textAlign="center">
            {name}
          </Text>
          <Text fontFamily="$mono" fontSize={11} textTransform="uppercase" letterSpacing={0.5} color={brand.grafite70}>
            Cliente
          </Text>
        </YStack>

        <Text fontSize="$3" color={brand.grafite70} textAlign="center">
          Telefono, email e indirizzo saranno visibili qui e in agenda non appena il preventivo verrà accettato.
        </Text>
      </YStack>
    </div>
  );
}
