"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ProfessionalReviewsLink } from "@/components/ProfessionalReviewsLink";
import type { ClientGuidedRequest } from "@professionisti/api-client";
import {
  TAX_BONUS_PAYMENT_NOTE,
  cancellationNoticeLabel,
  categoryMayHaveTaxBonus,
  formatAppointmentTimeRange,
  formatJobDays,
  formatServicePriceRange,
  paymentChoiceIsOnline,
  professionalPath,
  quotePriceTaxNote,
  quotePriceTotals,
  scheduleChangeBetween,
  scheduleChangeObject,
  type ClientInvoiceRequestInput,
  type JobPaymentChoice,
} from "@professionisti/shared";
import { PaymentChoice, PaymentOffer, selectablePaymentChoices } from "@/components/PaymentChoice";
import { useOnlinePayments } from "@/lib/onlinePayments";
import { Avatar, Badge, ProfessionalKindBadge, Text, XStack, YStack, brand } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";
import { CardButton } from "@/components/CardButton";
import { ContactButton } from "@/components/ContactButton";
import { ScheduleChangeBox } from "@/components/ScheduleChangeBox";
import { TimelineModal } from "@/components/TimelineModal";
import { useDismissableUnreadCount } from "@/lib/useDismissableUnreadCount";
import { textareaStyle } from "./clientRequestHelpers";
import { QuoteDateChooser } from "./QuoteDateChooser";
import { InvoiceRequestFields, InvoiceRequestToggle, emptyInvoiceDraft, invoiceDraftFromView, parseInvoiceDraft, type InvoiceDraft } from "@/components/ClientInvoiceRequestForm";

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
  // Lavoro su più giorni (docs/CHANGELOG.md §310): "dal 4 al 6 novembre · ogni giorno 08:00–17:00".
  const days = formatJobDays(startIso, endIso);
  if (days) return `${days} · ogni giorno ${formatAppointmentTimeRange(startIso, endIso)}`;
  const endLabel = new Date(endIso).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
  return `${formatQuoteDate(startIso)}–${endLabel}`;
}

/** Data+ora di invio di un preventivo (timestamp reale, fuso orario del browser). */
export function formatSentAt(iso: string): string {
  const date = new Date(iso);
  return `${date.toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" })} alle ${date.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}`;
}

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
  guidedRequestId,
  serviceMode,
  isNew,
  unreadCount,
  autoOpenTimeline,
  contactInBooking,
  requestOpen,
  notChosen,
  onDeleteRequest,
  categorySlug,
  invoiceDefaults,
}: {
  quote: ClientGuidedRequest["quotes"][number];
  /** Categoria della richiesta: avviso sulle detrazioni per i lavori in casa (docs/CHANGELOG.md §378). */
  categorySlug?: string;
  /** Nome e indirizzo della richiesta, per precompilare i dati della fattura (§378). */
  invoiceDefaults?: Partial<InvoiceDraft>;
  /** Richiesta ancora aperta: dopo un rifiuto il professionista può inviare un nuovo preventivo (docs/CHANGELOG.md §188). */
  requestOpen?: boolean;
  /** Per questa richiesta il cliente ha già accettato un altro preventivo: niente Accetta, Modifica, Rifiuta (docs/CHANGELOG.md §346). */
  notChosen?: boolean;
  token: string;
  onChanged: () => void;
  onAcceptQuote: (quoteId: string, paymentMethod: JobPaymentChoice, invoiceRequest?: ClientInvoiceRequestInput) => Promise<void>;
  /** Richiesta di origine, per i messaggi. */
  guidedRequestId: string;
  /** Modalità della richiesta originale — filtra le fasce proponibili a quelle che offrono questa modalità. */
  serviceMode: "HOME" | "ONLINE" | null;
  /** True se proprio QUESTO preventivo ha ricevuto un aggiornamento non letto. */
  isNew?: boolean;
  /** Numero di aggiornamenti non letti per questo preventivo — pallino rosso su "Messaggi". */
  unreadCount?: number;
  /** True se questo preventivo è il thread da cui arriva un nuovo messaggio in chat — apre subito il TimelineModal invece di aspettare un click. */
  autoOpenTimeline?: boolean;
  /** Il preventivo è diventato un intervento: i messaggi stanno lì, non qui (un solo pulsante per scheda). */
  contactInBooking?: boolean;
  /** "Non ti serve più il lavoro? Elimina la richiesta" nella conferma di Rifiuta (docs/CHANGELOG.md §343): chi non vuole più il lavoro sceglieva "Rifiuta". */
  onDeleteRequest?: () => void;
}) {
  const [isChoosingDate, setIsChoosingDate] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAccepting, setIsAccepting] = useState(false);
  // Scelta del metodo di pagamento prima di accettare (§168).
  const [choosingPayment, setChoosingPayment] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<JobPaymentChoice>("DIRECT");
  // Senza Stripe attivo si offre solo il pagamento diretto (docs/CHANGELOG.md §170).
  const onlinePayments = useOnlinePayments();
  const [confirmingReject, setConfirmingReject] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);
  // Nota facoltativa per il professionista al rifiuto (docs/CHANGELOG.md §188).
  const [rejectNote, setRejectNote] = useState("");
  const [showTimeline, setShowTimeline] = useState(false);
  // Fattura chiesta al professionista accettando (docs/CHANGELOG.md §378).
  const [invoiceWanted, setInvoiceWanted] = useState(!!quote.invoiceRequest);
  const [invoiceDraft, setInvoiceDraft] = useState<InvoiceDraft>(() => (quote.invoiceRequest ? invoiceDraftFromView(quote.invoiceRequest) : emptyInvoiceDraft(invoiceDefaults)));
  const [invoiceErrors, setInvoiceErrors] = useState<Partial<Record<keyof InvoiceDraft, string>>>({});
  const [taxBonusOpen, setTaxBonusOpen] = useState(false);
  const [effectiveUnreadCount, dismissUnread] = useDismissableUnreadCount(unreadCount);
  const autoOpenedTimelineRef = useRef(false);
  useEffect(() => {
    if (autoOpenTimeline && !autoOpenedTimelineRef.current) {
      autoOpenedTimelineRef.current = true;
      setShowTimeline(true);
    }
  }, [autoOpenTimeline]);
  const priceTotals = useMemo(() => quotePriceTotals(quote.items), [quote.items]);
  // Totale prima dell'ultima modifica dei prezzi, se diverso da quello di
  // ora (docs/CHANGELOG.md §196).
  const previousPriceText = useMemo(() => {
    if (quote.status !== "SENT" || !quote.previousPrice) return null;
    const before = formatServicePriceRange(quote.previousPrice.minEurCents, quote.previousPrice.maxEurCents);
    return before !== formatServicePriceRange(priceTotals.totalMinEurCents, priceTotals.totalMaxEurCents) ? before : null;
  }, [quote.status, quote.previousPrice, priceTotals]);

  // Modi che il cliente può davvero usare: con uno solo si accetta subito,
  // senza il passaggio della scelta (docs/CHANGELOG.md §339).
  const selectablePayments = selectablePaymentChoices(quote.paymentOptions, onlinePayments);
  const onlyPayment = selectablePayments.length === 1 ? selectablePayments[0] : undefined;

  async function toggleInvoice() {
    const next = !invoiceWanted;
    setInvoiceWanted(next);
    setInvoiceErrors({});
    // Gli ultimi dati usati, per non riscriverli (docs/CHANGELOG.md §378).
    if (next && !quote.invoiceRequest && !invoiceDraft.taxCode && !invoiceDraft.vatNumber) {
      const last = await apiClient.lastClientInvoiceRequest(token).catch(() => null);
      if (last?.invoiceRequest) setInvoiceDraft(invoiceDraftFromView(last.invoiceRequest));
    }
  }

  async function handleAccept(method: JobPaymentChoice = paymentMethod) {
    setError(null);
    let invoiceRequest: ClientInvoiceRequestInput | undefined;
    if (invoiceWanted) {
      const parsed = parseInvoiceDraft(invoiceDraft, quote.professionalKind === "PRIVATE");
      if (!parsed.ok) {
        setInvoiceErrors(parsed.errors);
        setError("Controlla i dati per la fattura.");
        return;
      }
      setInvoiceErrors({});
      invoiceRequest = parsed.data;
    }
    setIsAccepting(true);
    try {
      await onAcceptQuote(quote.id, method, invoiceRequest);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore imprevisto, riprova.");
    } finally {
      setIsAccepting(false);
    }
  }

  function startChoosingDate() {
    setError(null);
    setIsChoosingDate(true);
  }

  async function handleRejectQuote() {
    setError(null);
    setIsRejecting(true);
    try {
      await apiClient.rejectQuote(token, quote.id, { note: rejectNote.trim() || undefined });
      setRejectNote("");
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore imprevisto, riprova.");
      setConfirmingReject(false);
    } finally {
      setIsRejecting(false);
    }
  }

  // Scelta di un'altra data: sul preventivo appena ricevuto e anche per
  // cambiare una proposta già inviata, mentre si aspetta la risposta del
  // professionista (richiesta esplicita dell'utente, docs/CHANGELOG.md §221).
  // Riparte sempre dall'ultima data proposta (§223): la tua proposta in
  // attesa se c'è, altrimenti quella del preventivo.
  const dateChooser = isChoosingDate ? (
    <QuoteDateChooser
      token={token}
      quote={quote}
      serviceMode={serviceMode}
      from={
        quote.status === "MODIFICATION_REQUESTED" && quote.clientProposedDate
          ? { start: quote.clientProposedDate, end: quote.clientProposedEndDate }
          : { start: quote.estimatedStartDate, end: quote.estimatedEndDate }
      }
      onSent={() => {
        setIsChoosingDate(false);
        onChanged();
      }}
      onCancel={() => setIsChoosingDate(false)}
    />
  ) : null;

  return (
    <YStack id={`quote-${quote.id}`} backgroundColor={brand.gesso} borderRadius="$3" padding="$3" gap="$2">
      <XStack alignItems="center" gap="$2">
        {/* Foto accanto al nome (richiesta esplicita dell'utente), iniziali se manca; stesso link del nome, fuori dal Tab. */}
        <Link href={professionalPath({ id: quote.professionalProfileId, businessName: quote.businessName, city: quote.city })} tabIndex={-1} aria-hidden style={{ textDecoration: "none", alignSelf: "flex-start" }}>
          <Avatar name={quote.businessName} imageUrl={quote.imageUrl} size={40} />
        </Link>
        <YStack flex={1} minWidth={0} gap={2}>
          <XStack alignItems="center" gap="$2" flexWrap="wrap">
            <Link href={professionalPath({ id: quote.professionalProfileId, businessName: quote.businessName, city: quote.city })} style={{ textDecoration: "none" }}>
              <Text fontWeight="600" color={brand.cianografiaScuro}>
                {quote.businessName}
              </Text>
            </Link>
            {/* Che tipo di lavoratore ha mandato il preventivo, dove il cliente decide (richiesta dell'utente, §338). */}
            {quote.professionalKind ? <ProfessionalKindBadge kind={quote.professionalKind} /> : null}
            {/* Un preventivo accettato non è più una novità: le novità del lavoro sono sull'intervento (§228). */}
            {isNew && quote.status !== "ACCEPTED" ? <Badge variant="nuovo">Nuovo</Badge> : null}
          </XStack>
          {/* Stelle e numero di recensioni per scegliere tra più preventivi (richiesta dell'utente, §342). */}
          <ProfessionalReviewsLink professional={{ id: quote.professionalProfileId, businessName: quote.businessName, city: quote.city }} reviews={quote.reviews} />
        </YStack>
        {/* Messaggi accanto al nome, leggero: non compete con la scelta sul preventivo (§338). */}
        {contactInBooking ? null : (
          <ContactButton
            light
            unreadCount={effectiveUnreadCount}
            onPress={() => {
              setShowTimeline(true);
              dismissUnread();
            }}
          />
        )}
      </XStack>
      <Text fontSize={16} color={brand.grafite70}>
        Data proposta: {formatQuoteDateRange(quote.estimatedStartDate, quote.estimatedEndDate)}
      </Text>
      <Text fontSize={13} color={brand.grafite70}>
        {quote.resentAt ? `Nuovo preventivo inviato il ${formatSentAt(quote.resentAt)}, dopo il tuo rifiuto` : `Inviato il ${formatSentAt(quote.sentAt)}`}
      </Text>
      {(() => {
        // Stesso "prima → ora" che vede il professionista quando il cliente
        // propone un'altra data (docs/CHANGELOG.md §186).
        const change =
          quote.status === "SENT" && quote.previousSchedule
            ? scheduleChangeBetween(quote.previousSchedule, { start: quote.estimatedStartDate, end: quote.estimatedEndDate })
            : null;
        if (change && quote.previousSchedule) {
          return (
            <ScheduleChangeBox
              title={`Il professionista ha modificato ${scheduleChangeObject(change)}`}
              beforeLabel="Data originale"
              beforeText={formatQuoteDateRange(quote.previousSchedule.start, quote.previousSchedule.end)}
              afterLabel="Nuova data proposta"
              afterText={formatQuoteDateRange(quote.estimatedStartDate, quote.estimatedEndDate)}
              note={quote.professionalCounterNote}
            />
          );
        }
        // Nota scritta dal cliente senza cambiare data e orario: il
        // preventivo resta accettabile (docs/CHANGELOG.md §196).
        if (quote.status === "SENT" && quote.clientNote) {
          return (
            <ScheduleChangeBox
              title="Hai aggiunto una nota per il professionista (data e orario invariati)"
              afterLabel="Appuntamento"
              afterText={formatQuoteDateRange(quote.estimatedStartDate, quote.estimatedEndDate)}
              note={quote.clientNote}
            />
          );
        }
        // Stessa data e stesso orario della proposta del cliente: il
        // professionista ha solo aggiunto una nota, niente "prima → ora"
        // (docs/CHANGELOG.md §196).
        if (quote.status === "SENT" && quote.previousSchedule && quote.professionalCounterNote) {
          return (
            <ScheduleChangeBox
              title="Il professionista ha aggiunto una nota (data e orario invariati)"
              afterLabel="Appuntamento"
              afterText={formatQuoteDateRange(quote.estimatedStartDate, quote.estimatedEndDate)}
              note={quote.professionalCounterNote}
            />
          );
        }
        // Risposte precedenti a questa versione, senza l'appuntamento sostituito.
        return quote.status === "SENT" && quote.professionalCounterNote ? (
          <YStack gap="$2" borderWidth={1} borderColor={brand.ottone} backgroundColor={brand.calce} borderRadius="$3" padding="$3">
            <Text fontSize={16} fontWeight="600" color={brand.grafite}>
              Il professionista ha risposto proponendo: {formatQuoteDateRange(quote.estimatedStartDate, quote.estimatedEndDate)}
            </Text>
            <Text fontSize={16} color={brand.grafite70}>
              {quote.professionalCounterNote}
            </Text>
          </YStack>
        ) : null;
      })()}
      <YStack gap="$1">
        {quote.items.map((item) => (
          <Text key={item.id} color={brand.grafite70} fontSize={16}>
            {item.name}: {formatServicePriceRange(item.priceMinEurCents, item.priceMaxEurCents)}
          </Text>
        ))}
      </YStack>
      {priceTotals.totalMinEurCents > 0 || priceTotals.totalMaxEurCents > 0 ? (
        <YStack backgroundColor={brand.gesso} borderRadius="$3" padding="$3" gap="$1">
          <Text fontFamily="$body" fontSize={13} fontWeight="700" color={brand.grafite70}>
            Totale indicativo
          </Text>
          <XStack alignItems="baseline" gap="$2" flexWrap="wrap">
            {/* Prezzo cambiato dal professionista: il vecchio sbarrato accanto
                al nuovo, per non accettare un aumento senza accorgersene
                (docs/CHANGELOG.md §196). */}
            {previousPriceText ? (
              <Text fontSize={16} color={brand.grafite70} textDecorationLine="line-through">
                {previousPriceText}
              </Text>
            ) : null}
            <Text fontSize="$6" fontWeight="800" color={brand.grafite}>
              {formatServicePriceRange(priceTotals.totalMinEurCents, priceTotals.totalMaxEurCents)}
            </Text>
            {/* "IVA inclusa" solo per chi la applica, altrimenti "Prezzo finale" (docs/CHANGELOG.md §378). */}
            <Text fontSize={13} color={brand.grafite70}>
              {quotePriceTaxNote(quote.chargesVat ?? null)}
            </Text>
          </XStack>
          {previousPriceText ? (
            <Text fontSize={13} color={brand.ottone} fontWeight="600">
              Il professionista ha cambiato il prezzo
            </Text>
          ) : null}
        </YStack>
      ) : null}
      {quote.status === "SENT" && !notChosen ? (
        <PaymentOffer
          quoteMaxEurCents={priceTotals.totalMaxEurCents}
          onlineAvailable={onlinePayments}
          offered={quote.paymentOptions}
          depositPercent={quote.depositPercent}
        />
      ) : null}
      {/* Preavviso scelto dal professionista nel preventivo, detto prima di Accetta (docs/CHANGELOG.md §347, §348). */}
      {(quote.status === "SENT" || quote.status === "MODIFICATION_REQUESTED") && !notChosen ? (
        <Text fontSize={13} color={brand.grafite70}>
          Se poi devi annullare, avvisa almeno {cancellationNoticeLabel(quote.cancellationNoticeHours)} prima.
          {quote.lateCancelKeepsDeposit && onlinePayments && quote.paymentOptions.some(paymentChoiceIsOnline)
            ? " Se annulli più tardi e paghi l'acconto online, l'acconto resta al professionista."
            : ""}
        </Text>
      ) : null}
      {quote.notes ? (
        <YStack backgroundColor={brand.gesso} borderRadius="$3" padding="$3" gap="$1">
          <Text fontFamily="$body" fontSize={13} fontWeight="700" color={brand.grafite70}>
            Messaggio del professionista
          </Text>
          <Text color={brand.grafite70} fontSize={16}>
            {quote.notes}
          </Text>
        </YStack>
      ) : null}

      {notChosen && (quote.status === "SENT" || quote.status === "MODIFICATION_REQUESTED") ? (
        <Text fontSize={13} color={brand.grafite70} fontWeight="600">
          Non scelto: hai accettato un altro preventivo
        </Text>
      ) : quote.status === "SENT" ? (
        <>
          {/* Da telefono "Accetta preventivo" largo in fondo, dove arriva il
              pollice, con "Modifica" e "Rifiuta" affiancati sopra; da
              computer tutti in riga (richiesta dell'utente, §338). Durante
              accettazione, modifica o rifiuto restano solo i pulsanti di
              quel passaggio (docs/CHANGELOG.md §225). */}
          {/* Fattura chiesta al professionista, non a noi (richiesta dell'utente del 27/10/2026, §378). */}
          {!isChoosingDate && !confirmingReject ? (
            <YStack gap="$3" paddingTop="$2" borderTopWidth={1} borderTopColor={brand.filetto}>
              <InvoiceRequestToggle professionalName={quote.businessName} checked={invoiceWanted} receipt={quote.professionalKind === "PRIVATE"} onToggle={() => void toggleInvoice()} />
              {invoiceWanted ? <InvoiceRequestFields draft={invoiceDraft} onChange={setInvoiceDraft} errors={invoiceErrors} receipt={quote.professionalKind === "PRIVATE"} /> : null}
            </YStack>
          ) : null}
          {!choosingPayment && !isChoosingDate && !confirmingReject ? (
            <XStack gap="$2" flexWrap="wrap" alignItems="center" $xs={{ flexDirection: "column-reverse", alignItems: "stretch" }}>
              <CardButton
                tone="primary"
                arrow={onlyPayment !== undefined}
                disabled={isAccepting || selectablePayments.length === 0}
                $xs={{ height: 48 }}
                onPress={() => {
                  if (onlyPayment) {
                    void handleAccept(onlyPayment);
                    return;
                  }
                  // Preselezionato il primo modo offerto dal professionista (online per primo, se c'è).
                  setPaymentMethod(selectablePayments[0] ?? "DIRECT");
                  setChoosingPayment(true);
                }}
              >
                {isAccepting ? "Accettazione..." : onlyPayment && paymentChoiceIsOnline(onlyPayment) ? "Accetta e paga l'acconto" : "Accetta preventivo"}
              </CardButton>
              <XStack gap="$2">
                <CardButton $xs={{ height: 48, flex: 1, paddingHorizontal: 12 }} onPress={startChoosingDate}>
                  Modifica
                </CardButton>
                <CardButton tone="danger" $xs={{ height: 48, flex: 1, paddingHorizontal: 12 }} onPress={() => setConfirmingReject(true)}>
                  Rifiuta
                </CardButton>
              </XStack>
            </XStack>
          ) : null}
          {choosingPayment ? (
            <YStack gap="$3" paddingTop="$2" borderTopWidth={1} borderTopColor={brand.filetto}>
              <PaymentChoice
                value={paymentMethod}
                onChange={setPaymentMethod}
                quoteMaxEurCents={priceTotals.totalMaxEurCents}
                onlineAvailable={onlinePayments}
                offered={quote.paymentOptions}
                depositPercent={quote.depositPercent}
              />
              {/* Detrazioni per i lavori in casa (domanda 28 al commercialista): di solito serve il bonifico parlante (§378). */}
              {categoryMayHaveTaxBonus(categorySlug) && selectablePayments.some(paymentChoiceIsOnline) ? (
                <Text fontSize={13} color={brand.grafite70}>
                  {TAX_BONUS_PAYMENT_NOTE.short}{" "}
                  {taxBonusOpen ? (
                    TAX_BONUS_PAYMENT_NOTE.more
                  ) : (
                    <Text fontSize={13} fontWeight="700" color={brand.cianografiaScuro} textDecorationLine="underline" cursor="pointer" accessibilityRole="button" onPress={() => setTaxBonusOpen(true)}>
                      Scopri di più
                    </Text>
                  )}
                </Text>
              ) : null}
              <XStack gap="$2" flexWrap="wrap">
                <CardButton
                  tone="primary"
                  arrow
                  onPress={() => void handleAccept()}
                  disabled={isAccepting || !selectablePayments.includes(paymentMethod)}
                >
                  {isAccepting ? "Accettazione..." : paymentChoiceIsOnline(paymentMethod) ? "Accetta e paga l'acconto" : "Accetta preventivo"}
                </CardButton>
                <CardButton onPress={() => setChoosingPayment(false)} disabled={isAccepting}>
                  Annulla
                </CardButton>
              </XStack>
            </YStack>
          ) : null}
          {!isChoosingDate && confirmingReject ? (
            <YStack gap="$2">
              <Text fontSize={13} color={brand.urgenza}>
                Rifiutare questo preventivo?
              </Text>
              {/* Nota facoltativa (docs/CHANGELOG.md §188): il professionista
                  la legge e può inviarti un nuovo preventivo. */}
              <textarea aria-label="Nota per il professionista"
                value={rejectNote}
                onChange={(e) => setRejectNote(e.target.value)}
                placeholder="Nota per il professionista (facoltativa): es. il prezzo è troppo alto, mi serve prima di venerdì"
                rows={2}
                maxLength={1000}
                style={textareaStyle}
              />
              <XStack gap="$2" alignItems="center" flexWrap="wrap">
                <CardButton tone="dangerSolid" onPress={handleRejectQuote} disabled={isRejecting}>
                  {isRejecting ? "Rifiuto..." : "Conferma rifiuto"}
                </CardButton>
                <CardButton onPress={() => setConfirmingReject(false)} disabled={isRejecting}>
                  Annulla
                </CardButton>
              </XStack>
              {onDeleteRequest ? (
                <Text fontSize={13} color={brand.grafite70}>
                  Non ti serve più il lavoro?{" "}
                  <Text
                    fontSize={13}
                    fontWeight="700"
                    color={brand.urgenza}
                    textDecorationLine="underline"
                    cursor="pointer"
                    accessibilityRole="button"
                    onPress={() => {
                      setConfirmingReject(false);
                      onDeleteRequest();
                    }}
                  >
                    Elimina la richiesta
                  </Text>
                </Text>
              ) : null}
            </YStack>
          ) : null}
          {dateChooser}
        </>
      ) : quote.status === "MODIFICATION_REQUESTED" ? (
        <YStack gap="$1">
          <Text fontSize={13} color={brand.ottone} fontWeight="600">
            {/* Stessa data e stesso orario: hai solo aggiunto una nota (docs/CHANGELOG.md §196). */}
            {quote.clientProposedDate &&
            !scheduleChangeBetween(
              { start: quote.estimatedStartDate, end: quote.estimatedEndDate },
              { start: quote.clientProposedDate, end: quote.clientProposedEndDate },
            )
              ? "Hai aggiunto una nota, data e orario invariati: in attesa di conferma del professionista per il "
              : "In attesa di conferma del professionista per il "}
            {quote.clientProposedDate ? formatQuoteDateRange(quote.clientProposedDate, quote.clientProposedEndDate) : ""}
          </Text>
          {quote.clientProposedNote ? (
            <Text fontSize={13} color={brand.grafite70}>
              {quote.clientProposedNote}
            </Text>
          ) : null}
          {!isChoosingDate ? (
            <CardButton alignSelf="flex-start" $xs={{ height: 48 }} onPress={startChoosingDate}>
              Cambia proposta
            </CardButton>
          ) : null}
          {dateChooser}
        </YStack>
      ) : quote.status === "ACCEPTED" ? (
        // Niente "Come pago?": il metodo di pagamento è subito sotto, nella sezione dell'intervento (§228).
        <Text fontSize={13} color={brand.verificato} fontWeight="600">
          Accettato
        </Text>
      ) : quote.status === "REJECTED" ? (
        <YStack gap="$1">
          <Text fontSize={13} color={brand.urgenza} fontWeight="600">
            Hai rifiutato questo preventivo
          </Text>
          {quote.rejectionNote ? (
            <Text fontSize={13} color={brand.grafite70}>
              La tua nota: &quot;{quote.rejectionNote}&quot;
            </Text>
          ) : null}
          {requestOpen ? (
            <Text fontSize={13} color={brand.grafite70}>
              Il professionista può ancora inviarti un nuovo preventivo finché la richiesta è aperta.
            </Text>
          ) : null}
        </YStack>
      ) : quote.status === "WITHDRAWN" ? (
        <Text fontSize={13} color={brand.urgenza} fontWeight="600">
          Il professionista ha ritirato questo preventivo
        </Text>
      ) : null}

      {error ? (
        <Text color={brand.urgenza} fontSize={16}>
          {error}
        </Text>
      ) : null}

      {showTimeline ? (
        <TimelineModal token={token} guidedRequestId={guidedRequestId} professionalProfileId={quote.professionalProfileId} viewerRole="CLIENT" otherPartyName={quote.businessName} otherPartyImageUrl={quote.imageUrl} onClose={() => setShowTimeline(false)} />
      ) : null}
    </YStack>
  );
}
