"use client";

import { useEffect, useState } from "react";
import type { ClientGuidedRequest } from "@professionisti/api-client";
import { jobDayCount } from "@professionisti/shared";
import { Text, XStack, YStack, brand } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";
import { CardButton } from "@/components/CardButton";
import { ItalianDateInput } from "@/components/ItalianDateInput";
import { ItalianTimeInput } from "@/components/ItalianTimeInput";
import { textareaStyle } from "./clientRequestHelpers";

// `isCurrentProposal` distingue la data/orario attualmente proposti dal
// professionista quando non corrisponde a nessuna fascia reale
// dell'agenda (data/ora inserita a mano dal professionista, CLAUDE.md
// §46) — mai una vera fascia libera, solo aggiunta per poterla comunque
// scegliere/vedere nell'elenco.
export type FreeSlot = { date: string; startTime: string; endTime: string; isCurrentProposal?: boolean };

// Valore speciale per l'opzione "Altro" nel menu a tendina data/ora
// (richiesta esplicita dell'utente) — mai una data reale, quindi non può
// collidere con una vera chiave `date|startTime|endTime`.
export const MANUAL_OPTION_VALUE = "altro";

/**
 * "Proponi un'altra data" del preventivo, scelta tra le fasce libere reali
 * dell'agenda del professionista o a mano. La stessa anche per spostare un
 * appuntamento già fissato ("Non posso più" nel promemoria,
 * docs/changelog/2026-10-28-promemoria-whatsapp.md): un solo modo di
 * proporre una data, un solo modo di rispondere per il professionista.
 * Gli orari si ricaricano a ogni apertura.
 */
export function QuoteDateChooser({
  token,
  quote,
  serviceMode,
  from,
  onSent,
  onCancel,
}: {
  token: string;
  quote: ClientGuidedRequest["quotes"][number];
  /** Modalità della richiesta originale — filtra le fasce proponibili a quelle che offrono questa modalità. */
  serviceMode: "HOME" | "ONLINE" | null;
  /** Data da cui si parte: l'ultima proposta. */
  from: { start: string; end: string | null };
  onSent: () => void;
  onCancel: () => void;
}) {
  const [freeSlots, setFreeSlots] = useState<FreeSlot[] | null>(null);
  const [selectedSlotKey, setSelectedSlotKey] = useState("");
  const [proposeNote, setProposeNote] = useState("");
  const [manualDate, setManualDate] = useState("");
  const [manualStartTime, setManualStartTime] = useState("");
  const [manualEndTime, setManualEndTime] = useState("");
  const [isProposing, setIsProposing] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        const currentDate = from.start.slice(0, 10);
        const currentStartTime = from.start.slice(11, 16);
        const currentEndTime = from.end ? from.end.slice(11, 16) : currentStartTime;
        const matching = slots.find((s) => s.date === currentDate && s.startTime === currentStartTime);
        if (!matching) {
          slots.unshift({ date: currentDate, startTime: currentStartTime, endTime: currentEndTime, isCurrentProposal: true });
        }
        setFreeSlots(slots);
        const initial = matching ?? slots[0];
        if (initial) setSelectedSlotKey(`${initial.date}|${initial.startTime}|${initial.endTime}`);
      })
      .catch((err: unknown) => {
        if (active) setError(err instanceof Error ? err.message : "Errore nel caricamento degli orari disponibili.");
      });
    return () => {
      active = false;
    };
  }, [quote.professionalProfileId, serviceMode, from.start, from.end]);

  async function handleProposeDate() {
    let date: string;
    let startTime: string;
    let endTime: string;
    let isManual: boolean;
    if (selectedSlotKey === MANUAL_OPTION_VALUE) {
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
      // L'ultima proposta fuori dall'agenda, rimandata così com'è (magari con una nota).
      isManual = Boolean(freeSlots?.find((s) => s.isCurrentProposal && `${s.date}|${s.startTime}|${s.endTime}` === selectedSlotKey));
    }
    setError(null);
    setIsProposing(true);
    try {
      await apiClient.proposeQuoteDate(token, quote.id, { date, startTime, endTime, note: proposeNote.trim() || undefined, isManual: isManual || undefined });
      setProposeNote("");
      onSent();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore imprevisto, riprova.");
    } finally {
      setIsProposing(false);
    }
  }

  return (
    <YStack gap="$2" paddingTop="$2" borderTopWidth={1} borderTopColor={brand.filetto}>
      {freeSlots === null ? (
        error ? null : (
          <Text fontSize={13} color={brand.grafite70}>
            Caricamento orari disponibili...
          </Text>
        )
      ) : freeSlots.length === 0 ? (
        <Text fontSize={13} color={brand.grafite70}>
          Nessun orario libero nell&apos;agenda pubblica di questo professionista al momento.
        </Text>
      ) : (
        <>
          <select aria-label="Orario proposto" value={selectedSlotKey} onChange={(e) => setSelectedSlotKey(e.target.value)} style={textareaStyle}>
            {freeSlots.map((slot) => {
              const key = `${slot.date}|${slot.startTime}|${slot.endTime}`;
              const label = `${new Date(`${slot.date}T00:00:00Z`).toLocaleDateString("it-IT", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })} · ${slot.startTime}–${slot.endTime}${slot.isCurrentProposal ? " (proposta attuale)" : ""}`;
              return (
                <option key={key} value={key}>
                  {label}
                </option>
              );
            })}
            <option value={MANUAL_OPTION_VALUE}>Altro (data e orario personalizzati)</option>
          </select>
          {selectedSlotKey === MANUAL_OPTION_VALUE ? (
            <YStack gap="$2">
              <XStack gap="$2" flexWrap="wrap">
                <ItalianDateInput ariaLabel="Data" value={manualDate} onChange={setManualDate} style={{ ...textareaStyle, flex: 1, minWidth: 130 }} />
                <ItalianTimeInput ariaLabel="Ora di inizio" value={manualStartTime} onChange={setManualStartTime} style={{ ...textareaStyle, flex: 1, minWidth: 100 }} padX={10} />
                <ItalianTimeInput ariaLabel="Ora di fine" value={manualEndTime} onChange={setManualEndTime} style={{ ...textareaStyle, flex: 1, minWidth: 100 }} padX={10} />
              </XStack>
              <Text fontSize={13} color={brand.grafite70}>
                Il professionista dovrà confermare questo orario prima che diventi un appuntamento.
              </Text>
            </YStack>
          ) : null}
          {/* Lavoro su più giorni (docs/CHANGELOG.md §310): la durata resta quella del preventivo. */}
          {jobDayCount(quote.estimatedStartDate, quote.estimatedEndDate) > 1 ? (
            <Text fontSize={12} color={brand.grafite70}>
              Il lavoro dura {jobDayCount(quote.estimatedStartDate, quote.estimatedEndDate)} giorni: scegli il primo giorno e l&apos;orario di ogni giorno.
            </Text>
          ) : null}
          <textarea aria-label="Dettagli aggiuntivi" value={proposeNote} onChange={(e) => setProposeNote(e.target.value)} placeholder="Dettagli aggiuntivi (opzionale): es. posso solo dopo le 17" rows={2} style={textareaStyle} />
          <XStack gap="$2" flexWrap="wrap">
            <CardButton tone="primary" onPress={handleProposeDate} disabled={isProposing}>
              {isProposing ? "Invio..." : "Invia proposta"}
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
