"use client";

import { useEffect } from "react";
import { Avatar, Icon, Text, XStack, YStack, brand } from "@professionisti/ui";

/**
 * Scheda profilo del cliente, aperta cliccando il suo nome in una richiesta
 * ricevuta (`/dashboard`, `LeadCard`) — richiesta esplicita dell'utente
 * ("nelle richieste ricevute deve esserci anche il nome, cliccando si
 * aprirà la scheda profilo della persona"). Stesso pattern overlay di
 * BookingDetailPanel/PhotoLightbox (role="dialog", chiusura con
 * Escape/click sul backdrop, nessuna libreria aggiunta).
 *
 * Il cliente non ha un profilo pubblico in questo marketplace (solo i
 * professionisti ne hanno uno, /professionista/[id]): questa scheda mostra
 * nome + contatti. Telefono/email sono visibili già dalla prima richiesta
 * ricevuta, non solo dopo l'accettazione del preventivo — correzione
 * esplicita dell'utente rispetto alla scelta iniziale (CLAUDE.md §12), che
 * li mostrava solo su ProfessionalBooking/AcceptedJobCard.
 */
export function ClientProfileModal({
  name,
  phone,
  email,
  imageUrl,
  onClose,
}: {
  name: string;
  phone: string | null;
  email: string | null;
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

        <Avatar name={name} imageUrl={imageUrl ?? null} size={72} />

        <YStack gap="$1" alignItems="center">
          <Text fontFamily="$heading" fontWeight="800" fontSize="$6" color={brand.grafite} textAlign="center">
            {name}
          </Text>
          <Text fontFamily="$mono" fontSize={11} textTransform="uppercase" letterSpacing={0.5} color={brand.grafite70}>
            Cliente
          </Text>
        </YStack>

        {phone || email ? (
          <YStack gap="$2" width="100%">
            {phone ? (
              <a href={`tel:${phone}`} style={{ textDecoration: "none" }}>
                <XStack alignItems="center" justifyContent="center" gap="$2">
                  <Icon name="phone" size={14} color={brand.cianografia} strokeWidth={1.5} />
                  <Text color={brand.cianografia} fontSize="$3" fontWeight="600">
                    {phone}
                  </Text>
                </XStack>
              </a>
            ) : null}
            {email ? (
              <a href={`mailto:${email}`} style={{ textDecoration: "none" }}>
                <XStack alignItems="center" justifyContent="center" gap="$2">
                  <Icon name="mail" size={14} color={brand.cianografia} strokeWidth={1.5} />
                  <Text color={brand.cianografia} fontSize="$3" fontWeight="600">
                    {email}
                  </Text>
                </XStack>
              </a>
            ) : null}
          </YStack>
        ) : (
          <Text fontSize="$3" color={brand.grafite70} textAlign="center">
            Nessun contatto disponibile per questo cliente.
          </Text>
        )}
      </YStack>
    </div>
  );
}
