"use client";

import { useEffect } from "react";
import { formatServicePriceRange, type ProfessionalBooking } from "@professionisti/shared";
import { Button, Icon, Text, XStack, YStack, brand } from "@professionisti/ui";

const STATUS_LABEL: Record<ProfessionalBooking["status"], string> = {
  PENDING: "In attesa di conferma",
  CONFIRMED: "Confermata",
  COMPLETED: "Completata",
  CANCELED: "Annullata",
  NO_SHOW: "Cliente non presentato",
};

const STATUS_COLOR: Record<ProfessionalBooking["status"], string> = {
  PENDING: brand.ottone,
  CONFIRMED: brand.verificato,
  COMPLETED: brand.grafite70,
  CANCELED: brand.urgenza,
  NO_SHOW: brand.urgenza,
};

/**
 * Pannello di dettaglio aperto cliccando un evento nel calendario
 * "Prenotazioni" (/dashboard/agenda): overlay DOM grezzo, stesso pattern di
 * PhotoLightbox (role="dialog", chiusura con Escape/click sul backdrop,
 * nessuna libreria aggiunta).
 */
export function BookingDetailPanel({
  booking,
  onClose,
  onAction,
  isActionPending,
}: {
  booking: ProfessionalBooking;
  onClose: () => void;
  onAction: (status: "CONFIRMED" | "COMPLETED" | "CANCELED") => void;
  isActionPending: boolean;
}) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const date = new Date(booking.scheduledAt);

  return (
    <div
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Dettaglio prenotazione"
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
        maxWidth={420}
        backgroundColor={brand.calce}
        borderRadius="$3"
        borderWidth={1}
        borderColor={brand.filetto}
        padding="$5"
        gap="$4"
      >
        <XStack justifyContent="space-between" alignItems="flex-start" gap="$2">
          <YStack gap="$1">
            <Text fontFamily="$heading" fontWeight="800" fontSize="$6" color={brand.grafite}>
              {booking.clientName ?? "Cliente"}
            </Text>
            <Text fontFamily="$mono" fontSize={11} fontWeight="700" letterSpacing={0.5} textTransform="uppercase" color={STATUS_COLOR[booking.status]}>
              {STATUS_LABEL[booking.status]}
            </Text>
          </YStack>
          <Text fontSize="$5" color={brand.grafite70} cursor="pointer" onPress={onClose} accessibilityRole="button" accessibilityLabel="Chiudi">
            ✕
          </Text>
        </XStack>

        <YStack gap="$1">
          <Text fontFamily="$mono" fontSize={11} textTransform="uppercase" letterSpacing={0.5} color={brand.grafite70}>
            Data e ora
          </Text>
          <Text color={brand.grafite} fontSize="$4">
            {date.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
            {" · "}
            {date.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}
          </Text>
        </YStack>

        {/* Dati del cliente utili al professionista per andare a svolgere il
            lavoro (richiesta esplicita dell'utente): telefono/email come
            link diretti tel:/mailto:, indirizzo preciso se indicato nella
            richiesta guidata collegata (assente per le prenotazioni dirette
            da agenda, che non hanno una GuidedRequest). */}
        {booking.clientPhone || booking.clientEmail || booking.address ? (
          <YStack gap="$2">
            <Text fontFamily="$mono" fontSize={11} textTransform="uppercase" letterSpacing={0.5} color={brand.grafite70}>
              Contatti cliente
            </Text>
            <YStack gap="$1.5">
              {booking.clientPhone ? (
                <a href={`tel:${booking.clientPhone}`} style={{ textDecoration: "none" }}>
                  <XStack alignItems="center" gap="$2">
                    <Icon name="phone" size={14} color={brand.cianografia} strokeWidth={1.5} />
                    <Text color={brand.cianografia} fontSize="$3" fontWeight="600">
                      {booking.clientPhone}
                    </Text>
                  </XStack>
                </a>
              ) : null}
              {booking.clientEmail ? (
                <a href={`mailto:${booking.clientEmail}`} style={{ textDecoration: "none" }}>
                  <XStack alignItems="center" gap="$2">
                    <Icon name="mail" size={14} color={brand.cianografia} strokeWidth={1.5} />
                    <Text color={brand.cianografia} fontSize="$3" fontWeight="600">
                      {booking.clientEmail}
                    </Text>
                  </XStack>
                </a>
              ) : null}
              {booking.address ? (
                <XStack alignItems="center" gap="$2">
                  <Icon name="map-pin" size={14} color={brand.grafite70} strokeWidth={1.5} />
                  <Text color={brand.grafite} fontSize="$3">
                    {booking.address}
                  </Text>
                </XStack>
              ) : null}
            </YStack>
          </YStack>
        ) : null}

        {booking.items.length > 0 ? (
          <YStack gap="$2">
            <Text fontFamily="$mono" fontSize={11} textTransform="uppercase" letterSpacing={0.5} color={brand.grafite70}>
              Preventivo
            </Text>
            <YStack gap="$1">
              {booking.items.map((item) => (
                <XStack key={item.id} justifyContent="space-between" gap="$2">
                  <Text color={brand.grafite} fontSize="$3">
                    {item.name}
                  </Text>
                  <Text color={brand.grafite70} fontSize="$3">
                    {formatServicePriceRange(item.priceMinEurCents, item.priceMaxEurCents)}
                  </Text>
                </XStack>
              ))}
            </YStack>
          </YStack>
        ) : null}

        <XStack gap="$2" flexWrap="wrap">
          {booking.status === "PENDING" ? (
            <Button variant="secondary" size="$3" height={40} disabled={isActionPending} opacity={isActionPending ? 0.6 : 1} onPress={() => onAction("CONFIRMED")}>
              Conferma
            </Button>
          ) : null}
          {booking.status === "CONFIRMED" ? (
            <Button variant="secondary" size="$3" height={40} disabled={isActionPending} opacity={isActionPending ? 0.6 : 1} onPress={() => onAction("COMPLETED")}>
              Segna come completata
            </Button>
          ) : null}
          {booking.status === "PENDING" || booking.status === "CONFIRMED" ? (
            <Button variant="ghost" size="$3" height={40} disabled={isActionPending} opacity={isActionPending ? 0.6 : 1} onPress={() => onAction("CANCELED")}>
              Annulla
            </Button>
          ) : null}
        </XStack>
      </YStack>
    </div>
  );
}
