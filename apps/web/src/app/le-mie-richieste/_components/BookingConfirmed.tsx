"use client";

import { useEffect, useRef } from "react";
import type { ClientBooking } from "@professionisti/api-client";
import { Avatar, Icon, Surface, Text, XStack, YStack, brand } from "@professionisti/ui";
import { formatServicePriceRange, quotePriceTotals } from "@professionisti/shared";
import { CardButton } from "@/components/CardButton";
import { JobPaymentStatus } from "@/components/JobPaymentStatus";
import { AppointmentWhen, useAppointmentMoment } from "./AppointmentWhen";
import { AddToCalendar } from "./AddToCalendar";

/**
 * Subito dopo "Accetta preventivo" (docs/CHANGELOG.md §341, variante scelta
 * dall'utente): la conferma che l'appuntamento è fissato, il riepilogo e cosa
 * succede adesso, come le app di prenotazione. Stesso stile della pagina
 * "Richiesta inviata": foto con alone verde e spunta, niente festeggiamenti.
 */
export function BookingConfirmed({ booking, address, token, onDone }: { booking: ClientBooking; address: string | null; token: string; onDone: () => void }) {
  const moment = useAppointmentMoment(booking);
  const headingRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    window.scrollTo({ top: 0 });
    headingRef.current?.focus();
  }, []);
  const totals = quotePriceTotals(booking.quoteItems);
  const priceText = totals.totalMaxEurCents > 0 ? formatServicePriceRange(totals.totalMinEurCents, totals.totalMaxEurCents) : null;
  const online = !address;
  const direct = booking.payment?.method === "DIRECT";
  const steps = [
    { title: online ? `${booking.businessName} ha i tuoi contatti` : `${booking.businessName} ha il tuo indirizzo e il telefono`, note: "Ti può chiamare per i dettagli" },
    { title: "Ti ricordiamo l'appuntamento il giorno prima" },
    { title: direct ? "A lavoro finito lo paghi e lasci una recensione" : "A lavoro finito confermi e lasci una recensione" },
  ];

  return (
    <YStack width="100%" maxWidth={560} alignSelf="center" gap="$5">
      <YStack alignItems="center" gap="$3">
        <YStack position="relative" padding={6} borderRadius={999} backgroundColor={brand.cianografiaVelo}>
          <Avatar name={booking.businessName} imageUrl={booking.professionalImageUrl} size={88} />
          <XStack position="absolute" right={0} bottom={0} width={32} height={32} borderRadius={999} backgroundColor={brand.cianografia} borderWidth={3} borderColor={brand.gesso} alignItems="center" justifyContent="center">
            <Icon name="check" size={16} color="white" strokeWidth={3} />
          </XStack>
        </YStack>
        <div ref={headingRef} tabIndex={-1} style={{ outline: "none" }}>
          <Text tag="h1" fontFamily="$heading" fontWeight="800" fontSize="$8" color={brand.grafite} textAlign="center">
            Appuntamento prenotato
          </Text>
        </div>
        <Text fontSize={16} color={brand.grafite70} textAlign="center">
          {booking.businessName} ha ricevuto la conferma.
        </Text>
      </YStack>

      <Surface gap="$3">
        <AppointmentWhen booking={booking} moment={moment} />
        {address ? (
          <XStack alignItems="center" gap="$2">
            <Icon name="map-pin" size={18} color={brand.grafite70} />
            <Text flex={1} fontSize={16} color={brand.grafite}>
              {address}
            </Text>
          </XStack>
        ) : null}
        <YStack height={1} backgroundColor={brand.filetto} />
        {priceText ? (
          <XStack justifyContent="space-between" alignItems="baseline" gap="$2" flexWrap="wrap">
            <Text fontSize={16} color={brand.grafite70}>
              Totale indicativo
            </Text>
            <Text fontSize={18} fontWeight="800" color={brand.grafite}>
              {priceText}
            </Text>
          </XStack>
        ) : null}
        {booking.payment ? <JobPaymentStatus payment={booking.payment} audience="client" /> : null}
      </Surface>

      <YStack gap="$3">
        <Text fontSize={13} fontWeight="700" color={brand.grafite70}>
          Cosa succede adesso
        </Text>
        {steps.map((step, index) => (
          <XStack key={step.title} gap="$3" alignItems="flex-start">
            <XStack
              width={28}
              height={28}
              flexShrink={0}
              borderRadius={999}
              alignItems="center"
              justifyContent="center"
              backgroundColor={index === 0 ? brand.cianografia : "transparent"}
              borderWidth={index === 0 ? 0 : 2}
              borderColor={brand.filetto}
            >
              {index === 0 ? (
                <Icon name="check" size={14} color="white" strokeWidth={3} />
              ) : (
                <Text fontSize={14} fontWeight="700" color={brand.grafite70}>
                  {index + 1}
                </Text>
              )}
            </XStack>
            <YStack flex={1} minWidth={0}>
              <Text fontSize={16} fontWeight="700" color={brand.grafite}>
                {step.title}
              </Text>
              {step.note ? (
                <Text fontSize={14} color={brand.grafite70}>
                  {step.note}
                </Text>
              ) : null}
            </YStack>
          </XStack>
        ))}
      </YStack>

      <YStack gap="$3" alignItems="center">
        <CardButton tone="primary" alignSelf="stretch" onPress={onDone}>
          Vai all&apos;appuntamento
        </CardButton>
        <AddToCalendar token={token} bookingId={booking.id} />
      </YStack>
    </YStack>
  );
}
