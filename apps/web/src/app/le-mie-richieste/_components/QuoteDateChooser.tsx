"use client";

import { useEffect, useState } from "react";
import type { ClientBooking, ClientGuidedRequest } from "@professionisti/api-client";
import { bookingCancellationMoney, jobDayCount, quotePriceTotals, rescheduleCancellationLine } from "@professionisti/shared";
import { useMinuteClock } from "@/lib/useMinuteClock";
import { Text, XStack, YStack, brand } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";
import { CardButton } from "@/components/CardButton";
import { ItalianDateInput } from "@/components/ItalianDateInput";
import { ItalianTimeInput } from "@/components/ItalianTimeInput";
import { textareaStyle } from "./clientRequestHelpers";
import { WaitBarSignal } from "@/components/WaitBar";
import { WeekSlotPicker } from "@/components/WeekSlotPicker";

export type FreeSlot = { date: string; startTime: string; endTime: string };

const slotKey = (slot: FreeSlot) => `${slot.date}|${slot.startTime}|${slot.endTime}`;

/**
 * "Proponi un'altra data" del preventivo, scelta tra le fasce libere reali
 * dell'agenda del professionista o a mano. La stessa anche per spostare un
 * appuntamento già fissato ("Non posso più" nel promemoria,
 * docs/changelog/2026-10-28-promemoria-whatsapp.md): un solo modo di
 * proporre una data, un solo modo di rispondere per il professionista.
 * Gli orari si ricaricano a ogni apertura. Stessa scelta a righe della
 * richiesta e del preventivo (`WeekSlotPicker`) al posto del menu a tendina,
 * con "Scrivi un altro giorno o orario" per una data fuori dall'agenda
 * (docs/changelog/2026-11-19-cambio-data-cliente-come-richiesta.md).
 */
export function QuoteDateChooser({
  token,
  quote,
  serviceMode,
  from,
  booking,
  onSent,
  onCancel,
}: {
  token: string;
  quote: ClientGuidedRequest["quotes"][number];
  /** Modalità della richiesta originale — filtra le fasce proponibili a quelle che offrono questa modalità. */
  serviceMode: "HOME" | "ONLINE" | null;
  /** Data da cui si parte: l'ultima proposta. */
  from: { start: string; end: string | null };
  /** Appuntamento già fissato che si sposta: si dice cosa cambia per annullare con la data scelta. */
  booking?: ClientBooking;
  onSent: () => void;
  onCancel: () => void;
}) {
  const [freeSlots, setFreeSlots] = useState<FreeSlot[] | null>(null);
  const [selectedSlotKey, setSelectedSlotKey] = useState("");
  const [useManual, setUseManual] = useState(false);
  /** L'orario di adesso, se è una fascia dell'agenda: resta segnato mentre se ne sceglie un altro. */
  const [currentSlotKey, setCurrentSlotKey] = useState<string | null>(null);
  const [proposeNote, setProposeNote] = useState("");
  const [manualDate, setManualDate] = useState("");
  const [manualStartTime, setManualStartTime] = useState("");
  const [manualEndTime, setManualEndTime] = useState("");
  const [isProposing, setIsProposing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const now = useMinuteClock();

  useEffect(() => {
    let active = true;
    apiClient
      .getProfessionalAgenda(quote.professionalProfileId)
      .then((agenda) => {
        if (!active) return;
        const slots: FreeSlot[] = [];
        for (const day of agenda.days) {
          for (const slot of day.slots) {
            const modeInfo = serviceMode === "ONLINE" ? slot.online : slot.home;
            if (modeInfo && modeInfo.bookedCount < modeInfo.maxBookings) {
              slots.push({ date: day.date, startTime: slot.startTime, endTime: slot.endTime });
            }
          }
        }
        const matching = slots.find((s) => s.date === from.start.slice(0, 10) && s.startTime === from.start.slice(11, 16));
        setFreeSlots(slots);
        setCurrentSlotKey(matching ? slotKey(matching) : null);
        // Nessun orario già scelto: si propone una data diversa da quella di adesso.
        setSelectedSlotKey("");
        // Agenda senza orari liberi: resta la data scritta a mano.
        setUseManual(slots.length === 0);
      })
      .catch((err: unknown) => {
        if (active) setError(err instanceof Error ? err.message : "Errore nel caricamento degli orari disponibili.");
      });
    return () => {
      active = false;
    };
  }, [quote.professionalProfileId, serviceMode, from.start]);

  async function handleProposeDate() {
    let date: string;
    let startTime: string;
    let endTime: string;
    let isManual: boolean;
    if (useManual) {
      if (!manualDate) return setError("Indica una data.");
      if (!manualStartTime || !manualEndTime) return setError("Indica sia l'ora di inizio sia l'ora di fine.");
      if (manualEndTime <= manualStartTime) return setError("L'ora di fine deve essere dopo l'ora di inizio.");
      date = manualDate;
      startTime = manualStartTime;
      endTime = manualEndTime;
      isManual = true;
    } else {
      const parts = selectedSlotKey.split("|");
      if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) {
        setError("Scegli un orario.");
        return;
      }
      [date, startTime, endTime] = parts as [string, string, string];
      isManual = false;
    }
    setError(null);
    setIsProposing(true);
    try {
      // Una sola visita di un lavoro ricorrente (docs/changelog/2026-11-18-sposta-e-terminato-in-anticipo.md).
      const bookingId = booking?.recurring ? booking.id : undefined;
      await apiClient.proposeQuoteDate(token, quote.id, { date, startTime, endTime, note: proposeNote.trim() || undefined, isManual: isManual || undefined, bookingId });
      setProposeNote("");
      onSent();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore imprevisto, riprova.");
    } finally {
      setIsProposing(false);
    }
  }

  return (
    <YStack gap="2" paddingTop="2" borderTopWidth={1} borderTopColor={brand.filetto}>
      {freeSlots === null ? (
        error ? null : (
          <Text fontSize={13} color={brand.grafite70}>
            Caricamento orari disponibili...
            <WaitBarSignal />
          </Text>
        )
      ) : (
        <>
          <Text fontSize={16} fontWeight="700" color={brand.grafite}>
            {booking ? "Scegli la nuova data" : "Scegli un'altra data"}
          </Text>
          {!useManual ? (
            <YStack gap="2">
              <WeekSlotPicker
                slots={freeSlots}
                selectedKey={selectedSlotKey}
                keyOf={slotKey}
                onSelect={(key) => {
                  setSelectedSlotKey(key);
                  setError(null);
                }}
                label="Orari liberi del professionista"
                marked={currentSlotKey ? { key: currentSlotKey, text: booking ? "appuntamento di adesso" : "data del preventivo" } : undefined}
              />
              <Text fontSize={13} fontWeight="600" color={brand.cianografiaScuro} cursor="pointer" role="button" onPress={() => setUseManual(true)}>
                Scrivi un altro giorno o orario
              </Text>
            </YStack>
          ) : (
            <YStack gap="2">
              {freeSlots.length === 0 ? (
                <Text fontSize={13} color={brand.grafite70}>
                  Il professionista non ha orari liberi in agenda al momento: scrivi tu il giorno e l&apos;orario.
                </Text>
              ) : null}
              <XStack gap="2" flexWrap="wrap">
                <ItalianDateInput ariaLabel="Data" value={manualDate} onChange={setManualDate} style={{ ...textareaStyle, flex: 1, minWidth: 130 }} />
                <ItalianTimeInput ariaLabel="Ora di inizio" value={manualStartTime} onChange={setManualStartTime} style={{ ...textareaStyle, flex: 1, minWidth: 100 }} />
                <ItalianTimeInput ariaLabel="Ora di fine" value={manualEndTime} onChange={setManualEndTime} style={{ ...textareaStyle, flex: 1, minWidth: 100 }} />
              </XStack>
              <Text fontSize={13} color={brand.grafite70}>
                Il professionista dovrà confermare questo orario prima che diventi un appuntamento.
              </Text>
              {freeSlots.length > 0 ? (
                <Text fontSize={13} fontWeight="600" color={brand.cianografiaScuro} cursor="pointer" role="button" onPress={() => setUseManual(false)}>
                  Scegli tra gli orari liberi del professionista
                </Text>
              ) : null}
            </YStack>
          )}
          {/* Spostando un appuntamento fissato: con la data scelta il preavviso può essere già
              iniziato (docs/changelog/2026-11-13-annullare-spostamento.md). */}
          {booking
            ? (() => {
                const [date, startTime, endTime] =
                  useManual ? [manualDate, manualStartTime, manualEndTime] : selectedSlotKey.split("|");
                if (!date || !startTime || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(startTime)) return null;
                const line = rescheduleCancellationLine({
                  start: `${date}T${startTime}:00.000Z`,
                  end: endTime && /^\d{2}:\d{2}$/.test(endTime) ? `${date}T${endTime}:00.000Z` : null,
                  hours: booking.cancellationNoticeHours,
                  money: bookingCancellationMoney(booking.payment, booking.lateCancelKeepsDeposit, quotePriceTotals(booking.quoteItems).totalMaxEurCents),
                  audience: "client",
                  now,
                });
                return line ? (
                  <Text
                    fontSize={line.tone === "warning" ? 16 : 13}
                    fontWeight={line.tone === "warning" ? "600" : "400"}
                    color={line.tone === "warning" ? brand.ottoneScuro : brand.grafite70}
                    data-testid="reschedule-cancel"
                  >
                    {line.text}
                  </Text>
                ) : null;
              })()
            : null}
          {/* Lavoro su più giorni (docs/CHANGELOG.md §310): la durata resta quella del preventivo. */}
          {jobDayCount(quote.estimatedStartDate, quote.estimatedEndDate) > 1 ? (
            <Text fontSize={12} color={brand.grafite70}>
              Il lavoro dura {jobDayCount(quote.estimatedStartDate, quote.estimatedEndDate)} giorni: scegli il primo giorno e l&apos;orario di ogni giorno.
            </Text>
          ) : null}
          <textarea aria-label="Dettagli aggiuntivi" value={proposeNote} onChange={(e) => setProposeNote(e.target.value)} placeholder="Dettagli aggiuntivi (opzionale): es. posso solo dopo le 17" rows={2} style={textareaStyle} />
          <XStack gap="2" flexWrap="wrap">
            <CardButton waitingLabel={isProposing ? "Invio in corso…" : undefined} tone="primary" onPress={handleProposeDate} disabled={isProposing} opacity={1}>
              Invia proposta
            </CardButton>
            <CardButton onPress={onCancel} disabled={isProposing}>
              Annulla
            </CardButton>
          </XStack>
        </>
      )}
      {error ? (
        <Text color={brand.urgenza} fontSize={16} role="alert">
          {error}
        </Text>
      ) : null}
    </YStack>
  );
}
