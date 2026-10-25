"use client";

import { useEffect, useState } from "react";
import type { ClientBooking } from "@professionisti/api-client";
import { Text, XStack, YStack, brand, radiusSm } from "@professionisti/ui";
import { appointmentMoment, formatAppointmentDate, formatAppointmentTimeRange, formatJobDays, type AppointmentMoment } from "@professionisti/shared";

/**
 * Momento dell'appuntamento, ricalcolato ogni minuto così la scheda passa
 * da "domani" a "oggi" e a "com'è andata?" senza ricaricare (docs/CHANGELOG.md
 * §346). Null per un lavoro annullato o già chiuso dal cliente.
 */
export function useAppointmentMoment(booking: ClientBooking): AppointmentMoment | null {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);
  if (booking.status === "CANCELED" || booking.status === "NO_SHOW") return null;
  return appointmentMoment(booking.scheduledAt, booking.scheduledEndAt, booking.onTheWayAt, now);
}

const MOMENT_TEXT: Partial<Record<AppointmentMoment["kind"], string>> = {
  tomorrow: "Domani",
  today: "Oggi",
  onTheWay: "Oggi",
  inProgress: "In corso",
};

/** Foglietto del calendario, data e fascia oraria in grande, quanto manca. */
export function AppointmentWhen({ booking, moment }: { booking: ClientBooking; moment: AppointmentMoment | null }) {
  // Lavoro su più giorni (docs/CHANGELOG.md §310): "Dal 4 al 6 novembre · ogni giorno 08:00–17:00".
  const jobDays = formatJobDays(booking.scheduledAt, booking.scheduledEndAt);
  const time = formatAppointmentTimeRange(booking.scheduledAt, booking.scheduledEndAt);
  const title = jobDays
    ? `${jobDays.charAt(0).toUpperCase()}${jobDays.slice(1)}`
    : formatAppointmentDate(booking.scheduledAt, { weekday: "long", day: "numeric", month: "long" }).replace(/^./, (c) => c.toUpperCase());
  const momentText = moment?.kind === "days" ? `Tra ${moment.days} giorni` : moment ? MOMENT_TEXT[moment.kind] : undefined;
  const canceled = booking.status === "CANCELED";

  return (
    <XStack gap="$3" alignItems="center" opacity={canceled ? 0.6 : 1}>
      <YStack width={64} flexShrink={0} borderRadius={radiusSm} overflow="hidden" borderWidth={1} borderColor={brand.filetto} backgroundColor={brand.calce} alignItems="center" aria-hidden>
        <Text alignSelf="stretch" textAlign="center" backgroundColor={canceled ? brand.grafite70 : brand.cianografia} color="white" fontSize={12} fontWeight="700" paddingVertical={3} textTransform="uppercase">
          {formatAppointmentDate(booking.scheduledAt, { weekday: "short" }).replace(".", "")}
        </Text>
        <Text fontSize={26} fontWeight="800" color={brand.grafite} lineHeight={32}>
          {formatAppointmentDate(booking.scheduledAt, { day: "numeric" })}
        </Text>
        <Text fontSize={12} color={brand.grafite70} paddingBottom={4}>
          {formatAppointmentDate(booking.scheduledAt, { month: "short" }).replace(".", "")}
        </Text>
      </YStack>
      <YStack flex={1} minWidth={0} gap={2}>
        <Text fontFamily="$heading" fontWeight="800" fontSize={22} lineHeight={28} color={brand.grafite} textDecorationLine={canceled ? "line-through" : "none"}>
          {title}
        </Text>
        <Text fontSize={18} fontWeight="600" color={brand.grafite}>
          {jobDays ? `Ogni giorno ${time}` : time}
        </Text>
        {momentText ? (
          <Text fontSize={16} fontWeight={moment?.kind === "days" ? "500" : "700"} color={moment?.kind === "days" ? brand.grafite70 : brand.cianografiaScuro}>
            {momentText}
          </Text>
        ) : null}
      </YStack>
    </XStack>
  );
}
