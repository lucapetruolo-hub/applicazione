"use client";

import { useState } from "react";
import type { ProfessionalBooking } from "@professionisti/shared";
import { Icon, Text, XStack, YStack, brand } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";
import { CardButton } from "@/components/CardButton";
import { ScheduleChangeBox } from "@/components/ScheduleChangeBox";
import { formatDateTime, formatSlotRange, smallInputStyle } from "./requestHelpers";

const REMINDER_LABEL: Record<NonNullable<ProfessionalBooking["clientReminder"]>["status"], string> = {
  SENT: "inviato",
  DELIVERED: "consegnato",
  READ: "letto",
};

/**
 * Promemoria e risposta del cliente in una riga della richiesta (Luca,
 * 29/10/2026, docs/changelog/2026-10-28-promemoria-whatsapp.md): "Ci sarò",
 * "Non posso più" (l'ultima, se ha cambiato idea), oppure il promemoria
 * arrivato o letto e nessuna risposta ancora. Sopra, l'altra data proposta
 * dal cliente da accettare o rifiutare.
 */
export function AppointmentReplyStatus({ token, booking, onChanged }: { token: string; booking: ProfessionalBooking; onChanged: () => void }) {
  if (booking.status !== "CONFIRMED") return null;
  const cantCome = booking.clientCantComeAt && (!booking.clientConfirmedAt || booking.clientCantComeAt > booking.clientConfirmedAt);
  const reminder = booking.clientReminder;
  const reminderText = reminder
    ? `Promemoria ${reminder.channel === "WHATSAPP" ? `WhatsApp ${REMINDER_LABEL[reminder.status]}` : "mandato per email"} (${formatDateTime(reminder.at)})`
    : null;
  return (
    <YStack gap="$1.5">
      {booking.reschedule ? <RescheduleProposal token={token} booking={booking} reschedule={booking.reschedule} onChanged={onChanged} /> : null}
      {cantCome && !booking.reschedule ? (
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

function RescheduleProposal({
  token,
  booking,
  reschedule,
  onChanged,
}: {
  token: string;
  booking: ProfessionalBooking;
  reschedule: NonNullable<ProfessionalBooking["reschedule"]>;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore imprevisto, riprova.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <YStack gap="$2">
      <ScheduleChangeBox
        title="Il cliente non può più esserci e propone un'altra data"
        beforeLabel="Appuntamento di adesso"
        beforeText={formatSlotRange(booking.scheduledAt, booking.scheduledEndAt)}
        afterLabel="Data proposta"
        afterText={formatSlotRange(reschedule.start, reschedule.end)}
        note={reschedule.note}
      />
      {rejecting ? (
        <YStack gap="$2">
          <textarea aria-label="Nota per il cliente" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Nota per il cliente (opzionale): es. posso il giorno dopo" rows={2} style={smallInputStyle} />
          <XStack gap="$2" flexWrap="wrap">
            <CardButton tone="danger" onPress={() => void run(() => apiClient.rejectBookingReschedule(token, booking.id, { note: note.trim() || undefined }))} disabled={busy}>
              {busy ? "Invio..." : "Rifiuta la data"}
            </CardButton>
            <CardButton onPress={() => setRejecting(false)} disabled={busy}>
              Indietro
            </CardButton>
          </XStack>
        </YStack>
      ) : (
        <XStack gap="$2" flexWrap="wrap">
          <CardButton tone="primary" onPress={() => void run(() => apiClient.acceptBookingReschedule(token, booking.id))} disabled={busy}>
            {busy ? "Invio..." : "Accetta e sposta"}
          </CardButton>
          <CardButton onPress={() => setRejecting(true)} disabled={busy}>
            Non posso
          </CardButton>
        </XStack>
      )}
      {error ? (
        <Text fontSize={13} color={brand.urgenza} role="alert">
          {error}
        </Text>
      ) : null}
    </YStack>
  );
}
