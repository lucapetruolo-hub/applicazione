"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { ClientGuidedRequest } from "@professionisti/api-client";
import { formatServicePriceRange, quotePriceTotals } from "@professionisti/shared";
import { Badge, Button, Text, XStack, YStack, brand } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";
import { TimelineModal } from "@/components/TimelineModal";
import { UnreadDot } from "@/components/UnreadDot";
import { useDismissableUnreadCount } from "@/lib/useDismissableUnreadCount";
import { textareaStyle } from "./clientRequestHelpers";

export function formatQuoteDate(iso: string): string {
  const date = new Date(iso);
  return `${date.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" })} · ${date.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" })}`;
}

/**
 * Data + fascia oraria completa ("lunedì 5 agosto · 09:00–13:00") —
 * richiesta esplicita dell'utente: "non visualizzare solo il primo orario
 * ma tutta la fascia d'orario". Mostra solo l'inizio se la fine non è nota
 * (preventivi/proposte precedenti a questa funzionalità).
 */
export function formatQuoteDateRange(startIso: string, endIso: string | null): string {
  if (!endIso) return formatQuoteDate(startIso);
  const endLabel = new Date(endIso).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
  return `${formatQuoteDate(startIso)}–${endLabel}`;
}

/** Data+ora di invio di un preventivo (timestamp reale, fuso orario del browser). */
export function formatSentAt(iso: string): string {
  const date = new Date(iso);
  return `${date.toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" })} alle ${date.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}`;
}

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
 * Preventivo ricevuto: mostra la data proposta dal professionista e
 * permette al cliente di accettarla o proporne un'altra, scelta tra le
 * fasce libere reali dell'agenda del professionista.
 */
export function QuoteCard({
  quote,
  token,
  onChanged,
  onAcceptQuote,
  requestedTimeSlot,
  guidedRequestId,
  serviceMode,
  isNew,
  unreadCount,
  autoOpenTimeline,
}: {
  quote: ClientGuidedRequest["quotes"][number];
  token: string;
  onChanged: () => void;
  onAcceptQuote: (quoteId: string) => Promise<void>;
  /** Fascia oraria che il cliente aveva originariamente richiesto (solo se la richiesta è nata da una fascia generica dell'agenda), per evidenziare se il professionista l'ha cambiata. */
  requestedTimeSlot: string | null;
  /** Richiesta di origine, per il bottone "Cronologia". */
  guidedRequestId: string;
  /** Modalità della richiesta originale — filtra le fasce proponibili a quelle che offrono questa modalità. */
  serviceMode: "HOME" | "ONLINE" | null;
  /** True se proprio QUESTO preventivo ha ricevuto un aggiornamento non letto. */
  isNew?: boolean;
  /** Numero di aggiornamenti non letti per questo preventivo — pallino rosso accanto a "Contatta/Cronologia". */
  unreadCount?: number;
  /** True se questo preventivo è il thread da cui arriva un nuovo messaggio in chat — apre subito il TimelineModal invece di aspettare un click. */
  autoOpenTimeline?: boolean;
}) {
  const [isChoosingDate, setIsChoosingDate] = useState(false);
  const [freeSlots, setFreeSlots] = useState<FreeSlot[] | null>(null);
  const [selectedSlotKey, setSelectedSlotKey] = useState("");
  const [proposeNote, setProposeNote] = useState("");
  const [manualDate, setManualDate] = useState("");
  const [manualStartTime, setManualStartTime] = useState("");
  const [manualEndTime, setManualEndTime] = useState("");
  const [isProposing, setIsProposing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAccepting, setIsAccepting] = useState(false);
  const [showPaymentInfo, setShowPaymentInfo] = useState(false);
  const [confirmingReject, setConfirmingReject] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);
  const [showTimeline, setShowTimeline] = useState(false);
  const [effectiveUnreadCount, dismissUnread] = useDismissableUnreadCount(unreadCount);
  const autoOpenedTimelineRef = useRef(false);
  useEffect(() => {
    if (autoOpenTimeline && !autoOpenedTimelineRef.current) {
      autoOpenedTimelineRef.current = true;
      setShowTimeline(true);
    }
  }, [autoOpenTimeline]);
  const priceTotals = useMemo(() => quotePriceTotals(quote.items), [quote.items]);

  async function handleAccept() {
    setError(null);
    setIsAccepting(true);
    try {
      await onAcceptQuote(quote.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore imprevisto, riprova.");
    } finally {
      setIsAccepting(false);
    }
  }

  async function startChoosingDate() {
    setError(null);
    setIsChoosingDate(true);
    if (freeSlots === null) {
      try {
        const agenda = await apiClient.getProfessionalAgenda(quote.professionalProfileId);
        const slots: FreeSlot[] = [];
        for (const day of agenda.days) {
          for (const slot of day.slots) {
            const modeInfo = serviceMode === "ONLINE" ? slot.online : slot.home;
            if (modeInfo && modeInfo.bookedCount < modeInfo.maxBookings) {
              slots.push({ date: day.date, startTime: slot.startTime, endTime: slot.endTime });
            }
          }
        }
        const currentDate = quote.estimatedStartDate.slice(0, 10);
        const currentStartTime = quote.estimatedStartDate.slice(11, 16);
        const currentEndTime = quote.estimatedEndDate ? quote.estimatedEndDate.slice(11, 16) : currentStartTime;
        const matching = slots.find((s) => s.date === currentDate && s.startTime === currentStartTime);
        if (!matching) {
          slots.unshift({ date: currentDate, startTime: currentStartTime, endTime: currentEndTime, isCurrentProposal: true });
        }
        setFreeSlots(slots);
        const initial = matching ?? slots[0];
        if (initial) setSelectedSlotKey(`${initial.date}|${initial.startTime}|${initial.endTime}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Errore nel caricamento degli orari disponibili.");
      }
    }
  }

  async function handleProposeDate() {
    let date: string;
    let startTime: string;
    let endTime: string;
    let isManual = false;
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
    }
    setError(null);
    setIsProposing(true);
    try {
      await apiClient.proposeQuoteDate(token, quote.id, { date, startTime, endTime, note: proposeNote.trim() || undefined, isManual: isManual || undefined });
      setIsChoosingDate(false);
      setProposeNote("");
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore imprevisto, riprova.");
    } finally {
      setIsProposing(false);
    }
  }

  async function handleRejectQuote() {
    setError(null);
    setIsRejecting(true);
    try {
      await apiClient.rejectQuote(token, quote.id);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore imprevisto, riprova.");
      setConfirmingReject(false);
    } finally {
      setIsRejecting(false);
    }
  }

  return (
    <YStack backgroundColor={brand.gesso} borderRadius="$3" padding="$3" gap="$2">
      <XStack alignItems="center" gap="$2" flexWrap="wrap">
        <Link href={`/professionista/${quote.professionalProfileId}`} style={{ textDecoration: "none" }}>
          <Text fontWeight="600" color={brand.cianografia}>
            {quote.businessName}
          </Text>
        </Link>
        {isNew ? <Badge variant="nuovo">Nuovo</Badge> : null}
      </XStack>
      <Text fontSize="$3" color={brand.grafite70}>
        Data proposta: {formatQuoteDateRange(quote.estimatedStartDate, quote.estimatedEndDate)}
      </Text>
      <Text fontSize="$2" color={brand.grafite70}>
        Inviato il {formatSentAt(quote.sentAt)}
      </Text>
      <XStack
        alignItems="center"
        gap="$1"
        alignSelf="flex-start"
        cursor="pointer"
        accessibilityRole="button"
        onPress={() => {
          setShowTimeline(true);
          dismissUnread();
        }}
      >
        <Text fontSize="$2" fontWeight="600" color={brand.cianografia}>
          Contatta/Cronologia
        </Text>
        <UnreadDot count={effectiveUnreadCount} />
      </XStack>
      {quote.timeChangedFromRequest && requestedTimeSlot ? (
        <YStack gap="$1" borderWidth={1} borderColor={brand.ottone} backgroundColor={brand.calce} borderRadius="$2" padding="$2">
          <Text fontSize="$2" fontWeight="600" color={brand.grafite}>
            Il professionista ha proposto un orario diverso da quello richiesto ({requestedTimeSlot.replace("-", "–")}).
          </Text>
        </YStack>
      ) : null}
      {quote.status === "SENT" && quote.professionalCounterNote ? (
        <YStack gap="$2" borderWidth={1} borderColor={brand.ottone} backgroundColor={brand.calce} borderRadius="$3" padding="$3">
          <Text fontSize="$3" fontWeight="600" color={brand.grafite}>
            Il professionista ha risposto proponendo: {formatQuoteDateRange(quote.estimatedStartDate, quote.estimatedEndDate)}
          </Text>
          <Text fontSize="$3" color={brand.grafite70}>
            {quote.professionalCounterNote}
          </Text>
        </YStack>
      ) : null}
      <YStack gap="$1">
        {quote.items.map((item) => (
          <Text key={item.id} color={brand.grafite70} fontSize="$3">
            {item.name}: {formatServicePriceRange(item.priceMinEurCents, item.priceMaxEurCents)}
          </Text>
        ))}
      </YStack>
      {priceTotals.totalMinEurCents > 0 || priceTotals.totalMaxEurCents > 0 ? (
        <YStack backgroundColor={brand.gesso} borderRadius="$3" padding="$3" gap="$1">
          <Text fontFamily="$body" fontSize={11} fontWeight="700" color={brand.grafite70}>
            Totale indicativo
          </Text>
          <Text fontSize="$6" fontWeight="800" color={brand.grafite}>
            {formatServicePriceRange(priceTotals.totalMinEurCents, priceTotals.totalMaxEurCents)}
          </Text>
        </YStack>
      ) : null}
      {quote.notes ? (
        <YStack backgroundColor={brand.gesso} borderRadius="$3" padding="$3" gap="$1">
          <Text fontFamily="$body" fontSize={11} fontWeight="700" color={brand.grafite70}>
            Messaggio del professionista
          </Text>
          <Text color={brand.grafite70} fontSize="$3">
            {quote.notes}
          </Text>
        </YStack>
      ) : null}

      {quote.status === "SENT" ? (
        <>
          <XStack gap="$2" flexWrap="wrap" alignItems="center">
            <Button variant="primary" size="$3" height={40} onPress={handleAccept} disabled={isAccepting} opacity={isAccepting ? 0.6 : 1}>
              {isAccepting ? "Accettazione..." : "Accetta preventivo"}
            </Button>
            {!isChoosingDate ? (
              <Button variant="secondary" size="$3" height={40} onPress={startChoosingDate}>
                Modifica
              </Button>
            ) : null}
            {!isChoosingDate && !confirmingReject ? (
              <Button variant="ghost" size="$3" height={40} onPress={() => setConfirmingReject(true)}>
                <Text color={brand.urgenza} fontWeight="700" fontSize="$3">
                  Rifiuta
                </Text>
              </Button>
            ) : null}
          </XStack>
          {!isChoosingDate && confirmingReject ? (
            <XStack gap="$2" alignItems="center">
              <Text fontSize="$2" color={brand.urgenza}>
                Rifiutare questo preventivo?
              </Text>
              <Button variant="urgent" size="$2" height={36} onPress={handleRejectQuote} disabled={isRejecting} opacity={isRejecting ? 0.6 : 1}>
                {isRejecting ? "Rifiuto..." : "Conferma"}
              </Button>
              <Button variant="ghost" size="$2" height={36} onPress={() => setConfirmingReject(false)}>
                Annulla
              </Button>
            </XStack>
          ) : null}
          {isChoosingDate ? (
            <YStack gap="$2" paddingTop="$2" borderTopWidth={1} borderTopColor={brand.filetto}>
              {freeSlots === null ? (
                <Text fontSize="$2" color={brand.grafite70}>
                  Caricamento orari disponibili...
                </Text>
              ) : freeSlots.length === 0 ? (
                <Text fontSize="$2" color={brand.grafite70}>
                  Nessun orario libero nell&apos;agenda pubblica di questo professionista al momento.
                </Text>
              ) : (
                <>
                  <select value={selectedSlotKey} onChange={(e) => setSelectedSlotKey(e.target.value)} style={textareaStyle}>
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
                        <input type="date" value={manualDate} onChange={(e) => setManualDate(e.target.value)} style={{ ...textareaStyle, flex: 1, minWidth: 130 }} />
                        <input type="time" value={manualStartTime} onChange={(e) => setManualStartTime(e.target.value)} style={{ ...textareaStyle, flex: 1, minWidth: 100 }} />
                        <input type="time" value={manualEndTime} onChange={(e) => setManualEndTime(e.target.value)} style={{ ...textareaStyle, flex: 1, minWidth: 100 }} />
                      </XStack>
                      <Text fontSize={11} color={brand.grafite70}>
                        Il professionista dovrà confermare questo orario prima che diventi un appuntamento.
                      </Text>
                    </YStack>
                  ) : null}
                  <textarea value={proposeNote} onChange={(e) => setProposeNote(e.target.value)} placeholder="Dettagli aggiuntivi (opzionale): es. posso solo dopo le 17" rows={2} style={textareaStyle} />
                  <XStack gap="$2">
                    <Button variant="primary" size="$3" height={40} onPress={handleProposeDate} disabled={isProposing} opacity={isProposing ? 0.6 : 1}>
                      {isProposing ? "Invio..." : "Invia proposta"}
                    </Button>
                    <Button variant="ghost" size="$3" height={40} onPress={() => setIsChoosingDate(false)} disabled={isProposing}>
                      Annulla
                    </Button>
                  </XStack>
                </>
              )}
            </YStack>
          ) : null}
        </>
      ) : quote.status === "MODIFICATION_REQUESTED" ? (
        <YStack gap="$1">
          <Text fontSize="$2" color={brand.ottone} fontWeight="600">
            In attesa di conferma del professionista per il{" "}
            {quote.clientProposedDate ? formatQuoteDateRange(quote.clientProposedDate, quote.clientProposedEndDate) : ""}
          </Text>
          {quote.clientProposedNote ? (
            <Text fontSize="$2" color={brand.grafite70}>
              {quote.clientProposedNote}
            </Text>
          ) : null}
        </YStack>
      ) : quote.status === "ACCEPTED" ? (
        <YStack gap="$2">
          <Text fontSize="$2" color={brand.verificato} fontWeight="600">
            Accettato
          </Text>
          {showPaymentInfo ? (
            <Text fontSize="$2" color={brand.grafite70}>
              Il pagamento in piattaforma non è ancora attivo: accordati direttamente con il professionista sulle modalità di pagamento.
            </Text>
          ) : (
            <Text color={brand.cianografia} fontWeight="600" fontSize="$3" cursor="pointer" accessibilityRole="button" onPress={() => setShowPaymentInfo(true)}>
              Come pago?
            </Text>
          )}
        </YStack>
      ) : quote.status === "REJECTED" ? (
        <Text fontSize="$2" color={brand.urgenza} fontWeight="600">
          Hai rifiutato questo preventivo
        </Text>
      ) : quote.status === "WITHDRAWN" ? (
        <Text fontSize="$2" color={brand.urgenza} fontWeight="600">
          Il professionista ha ritirato questo preventivo
        </Text>
      ) : null}

      {error ? (
        <Text color={brand.urgenza} fontSize="$3">
          {error}
        </Text>
      ) : null}

      {showTimeline ? (
        <TimelineModal token={token} guidedRequestId={guidedRequestId} professionalProfileId={quote.professionalProfileId} viewerRole="CLIENT" otherPartyName={quote.businessName} onClose={() => setShowTimeline(false)} />
      ) : null}
    </YStack>
  );
}
