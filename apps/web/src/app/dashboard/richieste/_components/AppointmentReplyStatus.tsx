"use client";

import type { ProfessionalBooking } from "@professionisti/shared";
import { Icon, Text, XStack, YStack, brand } from "@professionisti/ui";
import { formatDateTime } from "./requestHelpers";

const REMINDER_LABEL: Record<NonNullable<ProfessionalBooking["clientReminder"]>["status"], string> = {
  SENT: "inviato",
  DELIVERED: "consegnato",
  READ: "letto",
};

/**
 * Promemoria e risposta del cliente in una riga della richiesta (Luca,
 * 29/10/2026, docs/changelog/2026-10-28-promemoria-whatsapp.md): "Ci sarò",
 * "Non posso più" (l'ultima, se ha cambiato idea), oppure il promemoria
 * arrivato o letto e nessuna risposta ancora. L'altra data proposta dal
 * cliente si vede nel riquadro della modifica, come per ogni preventivo.
 */
export function AppointmentReplyStatus({ booking }: { booking: ProfessionalBooking }) {
  if (booking.status !== "CONFIRMED") return null;
  const cantCome = booking.clientCantComeAt && (!booking.clientConfirmedAt || booking.clientCantComeAt > booking.clientConfirmedAt);
  const reminder = booking.clientReminder;
  const reminderText = reminder
    ? `Promemoria ${reminder.channel === "WHATSAPP" ? `WhatsApp ${REMINDER_LABEL[reminder.status]}` : "mandato per email"} (${formatDateTime(reminder.at)})`
    : null;
  return (
    <YStack gap="$1.5">
      {booking.dateChangeRequestedAt ? null : cantCome ? (
        <Text fontSize={13} color={brand.urgenza} fontWeight="600">
          Il cliente ha risposto al promemoria che non può più esserci ({formatDateTime(booking.clientCantComeAt!)}): gli abbiamo chiesto di proporti un&apos;altra data. Puoi anche scrivergli in chat.
        </Text>
      ) : booking.clientConfirmedAt && !cantCome ? (
        <XStack alignItems="center" gap="$1.5">
          <Icon name="check" size={14} color={brand.cianografiaScuro} strokeWidth={2.5} />
          <Text fontSize={13} color={brand.cianografiaScuro} fontWeight="600">
            Il cliente ha confermato che ci sarà ({formatDateTime(booking.clientConfirmedAt)})
          </Text>
        </XStack>
      ) : reminderText && !cantCome ? (
        <Text fontSize={13} color={brand.grafite70}>
          {reminderText}: il cliente non ha ancora risposto.
        </Text>
      ) : null}
    </YStack>
  );
}
