"use client";

import { useEffect, useState } from "react";
import type { ClientBooking } from "@professionisti/api-client";
import { Text, XStack, YStack, brand } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";
import { CardButton } from "@/components/CardButton";
import { ItalianDateInput } from "@/components/ItalianDateInput";
import { ItalianTimeInput } from "@/components/ItalianTimeInput";
import { ScheduleChangeBox } from "@/components/ScheduleChangeBox";
import { textareaStyle } from "./clientRequestHelpers";
import { formatQuoteDateRange, MANUAL_OPTION_VALUE, type FreeSlot } from "./QuoteCard";

/**
 * "Non posso più" → "Proponi un'altra data" per l'appuntamento già fissato
 * (Luca, 29/10/2026, docs/changelog/2026-10-28-promemoria-whatsapp.md): gli
 * orari liberi dell'agenda del professionista o una data a mano. Il
 * professionista la accetta (l'appuntamento si sposta) o la rifiuta; fino ad
 * allora l'appuntamento resta com'era. Si apre anche dal link del promemoria
 * (`&cambiaData=1`).
 */
export function RescheduleBookingPanel({
  token,
  booking,
  serviceMode,
  isOpen,
  onClose,
  onChanged,
}: {
  token: string;
  booking: ClientBooking;
  serviceMode: "HOME" | "ONLINE" | null;
  isOpen: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [freeSlots, setFreeSlots] = useState<FreeSlot[] | null>(null);
  const [selectedSlotKey, setSelectedSlotKey] = useState("");
  const [manualDate, setManualDate] = useState("");
  const [manualStartTime, setManualStartTime] = useState("");
  const [manualEndTime, setManualEndTime] = useState("");
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    apiClient
      .getProfessionalAgenda(booking.professionalProfileId)
      .then((agenda) => {
        if (!active) return;
        const slots: FreeSlot[] = [];
        for (const day of agenda.days) {
          for (const slot of day.slots) {
            const mode = serviceMode === "ONLINE" ? slot.online : slot.home;
            if (mode && mode.bookedCount < mode.maxBookings) slots.push({ date: day.date, startTime: slot.startTime, endTime: slot.endTime });
          }
        }
        setFreeSlots(slots);
        const first = slots[0];
        setSelectedSlotKey(first ? `${first.date}|${first.startTime}|${first.endTime}` : MANUAL_OPTION_VALUE);
      })
      .catch(() => {
        if (!active) return;
        // Senza agenda resta la data scritta a mano.
        setFreeSlots([]);
        setSelectedSlotKey(MANUAL_OPTION_VALUE);
      });
    return () => {
      active = false;
    };
  }, [isOpen, booking.professionalProfileId, serviceMode]);

  async function send() {
    let date: string;
    let startTime: string;
    let endTime: string;
    if (selectedSlotKey === MANUAL_OPTION_VALUE) {
      if (!manualDate) return setError("Indica una data.");
      if (!manualStartTime || !manualEndTime) return setError("Indica sia l'ora di inizio sia l'ora di fine.");
      if (manualEndTime <= manualStartTime) return setError("L'ora di fine deve essere dopo l'ora di inizio.");
      [date, startTime, endTime] = [manualDate, manualStartTime, manualEndTime];
    } else {
      const parts = selectedSlotKey.split("|");
      if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) return setError("Scegli un orario.");
      [date, startTime, endTime] = parts as [string, string, string];
    }
    setError(null);
    setSending(true);
    try {
      await apiClient.proposeBookingReschedule(token, booking.id, { date, startTime, endTime, note: note.trim() || undefined });
      setNote("");
      onClose();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore imprevisto, riprova.");
    } finally {
      setSending(false);
    }
  }

  const pending = booking.reschedule ? (
    <ScheduleChangeBox
      title="Hai proposto un'altra data: aspettiamo la risposta del professionista"
      beforeLabel="Appuntamento di adesso"
      beforeText={formatQuoteDateRange(booking.scheduledAt, booking.scheduledEndAt)}
      afterLabel="Data proposta"
      afterText={formatQuoteDateRange(booking.reschedule.start, booking.reschedule.end)}
      note={booking.reschedule.note}
    />
  ) : null;

  if (booking.status !== "CONFIRMED") return null;
  if (!isOpen) return pending;

  return (
    <YStack gap="$2" paddingTop="$2" borderTopWidth={1} borderTopColor={brand.filetto}>
      {pending}
      <Text fontSize={16} fontWeight="700" color={brand.grafite}>
        Proponi un&apos;altra data
      </Text>
      <Text fontSize={13} color={brand.grafite70}>
        Se il professionista la accetta, l&apos;appuntamento si sposta. Fino ad allora resta com&apos;è.
      </Text>
      {freeSlots === null ? (
        <Text fontSize={13} color={brand.grafite70}>
          Caricamento orari disponibili...
        </Text>
      ) : (
        <>
          <select aria-label="Nuova data" value={selectedSlotKey} onChange={(e) => setSelectedSlotKey(e.target.value)} style={textareaStyle}>
            {freeSlots.map((slot) => {
              const key = `${slot.date}|${slot.startTime}|${slot.endTime}`;
              const label = `${new Date(`${slot.date}T00:00:00Z`).toLocaleDateString("it-IT", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })} · ${slot.startTime}–${slot.endTime}`;
              return (
                <option key={key} value={key}>
                  {label}
                </option>
              );
            })}
            <option value={MANUAL_OPTION_VALUE}>Altro (data e orario personalizzati)</option>
          </select>
          {selectedSlotKey === MANUAL_OPTION_VALUE ? (
            <XStack gap="$2" flexWrap="wrap">
              <ItalianDateInput ariaLabel="Data" value={manualDate} onChange={setManualDate} style={{ ...textareaStyle, flex: 1, minWidth: 130 }} />
              <ItalianTimeInput ariaLabel="Ora di inizio" value={manualStartTime} onChange={setManualStartTime} style={{ ...textareaStyle, flex: 1, minWidth: 100 }} padX={10} />
              <ItalianTimeInput ariaLabel="Ora di fine" value={manualEndTime} onChange={setManualEndTime} style={{ ...textareaStyle, flex: 1, minWidth: 100 }} padX={10} />
            </XStack>
          ) : null}
          <textarea aria-label="Dettagli aggiuntivi" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Dettagli aggiuntivi (opzionale): es. posso solo dopo le 17" rows={2} style={textareaStyle} />
          <XStack gap="$2" flexWrap="wrap">
            <CardButton tone="primary" onPress={() => void send()} disabled={sending}>
              {sending ? "Invio..." : "Invia proposta"}
            </CardButton>
            <CardButton onPress={onClose} disabled={sending}>
              Annulla
            </CardButton>
          </XStack>
        </>
      )}
      {error ? (
        <Text fontSize={13} color={brand.urgenza} role="alert">
          {error}
        </Text>
      ) : null}
    </YStack>
  );
}
