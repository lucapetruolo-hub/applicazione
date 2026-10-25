"use client";

import { useState } from "react";
import type { ClientBooking } from "@professionisti/api-client";
import { Icon, Text, XStack, YStack, brand, radiusDoc } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";
import { JOB_ISSUE_LABEL, JOB_ISSUE_STATUS_LABEL, formatEurCents, formatServicePriceRange, quotePriceTotals, type AppointmentMoment } from "@professionisti/shared";
import { AppointmentWhen, useAppointmentMoment } from "./AppointmentWhen";
import { AddToCalendar } from "./AddToCalendar";
import { UnreadDot } from "@/components/UnreadDot";
import { ClientIssueStatus } from "./ClientIssueStatus";
import { JobPaymentStatus } from "@/components/JobPaymentStatus";
import { TimelineModal } from "@/components/TimelineModal";
import { ClientCompleteModal } from "@/components/ClientCompleteModal";
import { ReviewModal } from "@/components/ReviewModal";
import { CardButton } from "@/components/CardButton";
import { useDismissableUnreadCount } from "@/lib/useDismissableUnreadCount";

/**
 * Il lavoro nato dal preventivo accettato, in cima alla scheda come un
 * biglietto dell'appuntamento (docs/CHANGELOG.md §344, variante C scelta
 * dall'utente): quando, dove, chiama o scrivi, quanto e come si paga. La
 * riga in cima e il pulsante principale cambiano col momento (tra qualche
 * giorno, domani, sta arrivando, com'è andata). La trattativa (richiesta,
 * preventivi) resta sotto, chiusa, in `GuidedRequestCard`.
 */
export function BookingSection({
  booking,
  token,
  onChanged,
  unreadCount,
  address,
  onReportProblem,
}: {
  booking: ClientBooking;
  token: string;
  onChanged: () => void;
  unreadCount?: number;
  /** Dove si svolge il lavoro (dalla richiesta), null per una consulenza online. */
  address: string | null;
  /** "C'è un problema" dopo l'orario: apre la segnalazione della scheda. Null se non si può segnalare. */
  onReportProblem: (() => void) | null;
}) {
  const [showClientCompleteModal, setShowClientCompleteModal] = useState(false);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [isReopening, setIsReopening] = useState(false);
  const [reopenError, setReopenError] = useState<string | null>(null);
  const [confirmingDeleteBooking, setConfirmingDeleteBooking] = useState(false);
  const [isDeletingBooking, setIsDeletingBooking] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [showTimeline, setShowTimeline] = useState(false);
  const [issueBusy, setIssueBusy] = useState(false);
  const [issueError, setIssueError] = useState<string | null>(null);
  const [effectiveUnreadCount, dismissUnread] = useDismissableUnreadCount(unreadCount);

  async function handleReopenBooking() {
    setReopenError(null);
    setIsReopening(true);
    try {
      await apiClient.reopenBooking(token, booking.id);
      onChanged();
    } catch (err) {
      setReopenError(err instanceof Error ? err.message : "Errore imprevisto, riprova.");
    } finally {
      setIsReopening(false);
    }
  }

  async function handleDeleteBooking() {
    setDeleteError(null);
    setIsDeletingBooking(true);
    try {
      await apiClient.deleteBooking(token, booking.id);
      onChanged();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Errore imprevisto, riprova.");
      setConfirmingDeleteBooking(false);
    } finally {
      setIsDeletingBooking(false);
    }
  }

  async function handleClientConfirmComplete() {
    await apiClient.clientConfirmComplete(token, booking.id, { photoUrls: [] });
    setShowClientCompleteModal(false);
    // Subito la recensione, anche se il professionista non ha ancora segnato
    // il lavoro come terminato (§189). Mai con una segnalazione in corso.
    if (!booking.hasReview && booking.issue?.status !== "OPEN" && booking.issue?.status !== "CHAT") {
      setShowReviewModal(true);
    } else {
      onChanged();
    }
  }

  async function handleSubmitReview(input: { rating: number; comment?: string; mediaUrls: string[] }) {
    await apiClient.createReview(token, { bookingId: booking.id, rating: input.rating, comment: input.comment, photoUrls: input.mediaUrls });
    setShowReviewModal(false);
    onChanged();
  }

  function closeReviewModal() {
    setShowReviewModal(false);
    onChanged();
  }

  // Fine della fase in chat di una segnalazione (§165), decisa dal cliente.
  async function closeIssueChat(outcome: "RESOLVED" | "ESCALATE") {
    setIssueError(null);
    setIssueBusy(true);
    try {
      await apiClient.closeJobIssueChat(token, booking.id, outcome);
      onChanged();
    } catch (err) {
      setIssueError(err instanceof Error ? err.message : "Errore imprevisto, riprova.");
    } finally {
      setIssueBusy(false);
    }
  }

  // Mancata presentazione accolta: stessa richiesta ad altri professionisti (§167).
  async function redispatch() {
    setIssueError(null);
    setIssueBusy(true);
    try {
      await apiClient.redispatchJobIssue(token, booking.id);
      onChanged();
    } catch (err) {
      setIssueError(err instanceof Error ? err.message : "Errore imprevisto, riprova.");
    } finally {
      setIssueBusy(false);
    }
  }

  const moment = useAppointmentMoment(booking);
  const live = booking.status === "CONFIRMED" || booking.status === "PENDING";
  const proGone = booking.professionalAccountDeleted;
  const upcoming = live && !proGone && isUpcoming(moment);
  const issueOpen = booking.issue?.status === "OPEN" || booking.issue?.status === "CHAT";
  // "Lavoro terminato" solo da quando l'appuntamento è iniziato (§344):
  // prima compariva già giorni prima. Se il professionista l'ha già chiuso, subito.
  const started = moment?.kind === "inProgress" || moment?.kind === "over" || booking.status === "COMPLETED";
  const canConfirmDone =
    (booking.status === "CONFIRMED" || booking.status === "COMPLETED") && started && !booking.hasReview && !booking.canReview && !issueOpen && !booking.clientConfirmedCompletedAt;
  const canWriteReview = (booking.status === "CONFIRMED" || booking.status === "COMPLETED") && booking.canReview && !booking.hasReview;
  const onTheWay = live && moment?.kind === "onTheWay" && !canConfirmDone ? moment : null;
  const phone = booking.professionalAccountDeleted ? null : booking.professionalPhone;
  const totals = quotePriceTotals(booking.quoteItems);
  const priceText = totals.totalMinEurCents > 0 || totals.totalMaxEurCents > 0 ? formatServicePriceRange(totals.totalMinEurCents, totals.totalMaxEurCents) : null;
  // Un solo pulsante pieno per momento: quando tocca al cliente confermare o recensire, "Chiama" passa in secondo piano.
  const stripAction = canConfirmDone || canWriteReview;

  return (
    <YStack gap="$3" paddingTop="$3">
      {onTheWay ? (
        <XStack gap="$3" alignItems="center" backgroundColor={brand.cianografiaVelo} borderRadius={radiusDoc} padding="$3">
          <Icon name="truck" size={22} color={brand.cianografiaScuro} />
          <YStack flex={1} minWidth={0}>
            <Text fontFamily="$heading" fontWeight="800" fontSize={18} color={brand.grafite}>
              {booking.businessName} sta arrivando
            </Text>
            <Text fontSize={14} color={brand.grafite70}>
              Partito alle {onTheWay.since}
            </Text>
          </YStack>
        </XStack>
      ) : null}

      {live && proGone && isUpcoming(moment) ? (
        <YStack gap="$1" backgroundColor={brand.gesso} borderRadius={radiusDoc} padding="$4">
          <Text fontFamily="$heading" fontWeight="800" fontSize={18} color={brand.grafite}>
            Questo appuntamento non si farà
          </Text>
          <Text fontSize={16} color={brand.grafite70}>
            Il professionista ha chiuso il suo account. Puoi eliminare la prenotazione e ripetere la richiesta.
          </Text>
        </YStack>
      ) : null}

      {booking.status === "NO_SHOW" ? (
        <YStack gap="$1" backgroundColor={brand.gesso} borderRadius={radiusDoc} padding="$4">
          <Text fontFamily="$heading" fontWeight="800" fontSize={18} color={brand.grafite}>
            Appuntamento segnato come mancato
          </Text>
          <Text fontSize={16} color={brand.grafite70}>
            Il professionista ha segnato che non eri presente. Se non è andata così, scrivigli un messaggio.
          </Text>
        </YStack>
      ) : null}

      {canConfirmDone || canWriteReview ? (
        <YStack gap="$3" backgroundColor={brand.cianografiaVelo} borderRadius={radiusDoc} padding="$4">
          <YStack gap={2}>
            <Text fontFamily="$heading" fontWeight="800" fontSize={20} color={brand.grafite}>
              {canConfirmDone && moment?.kind === "inProgress" ? "Lavoro in corso" : "Com'è andata?"}
            </Text>
            <Text fontSize={16} color={brand.grafite70}>
              {canConfirmDone ? "Quando ha finito, confermalo qui." : "Una recensione aiuta altri clienti a scegliere."}
            </Text>
          </YStack>
          <XStack gap="$2" flexWrap="wrap">
            {canConfirmDone ? (
              // Turchese come dal lato del professionista (richiesta esplicita dell'utente).
              <CardButton fill="#20B2AA" $xs={{ flex: 1 }} onPress={() => setShowClientCompleteModal(true)}>
                Lavoro terminato
              </CardButton>
            ) : (
              <CardButton tone="primary" $xs={{ flex: 1 }} onPress={() => setShowReviewModal(true)}>
                Lascia una recensione
              </CardButton>
            )}
            {canConfirmDone && onReportProblem ? (
              <CardButton $xs={{ flex: 1 }} onPress={onReportProblem}>
                C&apos;è un problema
              </CardButton>
            ) : null}
          </XStack>
        </YStack>
      ) : null}

      <XStack gap="$4" flexWrap="wrap" alignItems="flex-start">
        <YStack flex={1} flexBasis={300} minWidth={0} gap="$3">
          <AppointmentWhen booking={booking} moment={moment} />
          {address ? (
            <XStack alignItems="center" gap="$2">
              <Icon name="map-pin" size={18} color={brand.grafite70} />
              <Text flex={1} fontSize={16} color={brand.grafite}>
                {address}
              </Text>
            </XStack>
          ) : null}
          {booking.meetingLink && booking.status !== "CANCELED" ? (
            <a href={booking.meetingLink} target="_blank" rel="noreferrer" style={{ textDecoration: "none", alignSelf: "flex-start" }}>
              <CardButton tone={stripAction ? "outline" : "primary"}>
                <XStack alignItems="center" gap="$2">
                  <Icon name="video" size={16} color={stripAction ? brand.grafite : "white"} strokeWidth={1.5} />
                  <Text fontFamily="$body" fontSize={16} color={stripAction ? brand.grafite : "white"} fontWeight="600">
                    Partecipa alla videochiamata
                  </Text>
                </XStack>
              </CardButton>
            </a>
          ) : null}
          {upcoming ? <AddToCalendar token={token} bookingId={booking.id} /> : null}
        </YStack>

        {booking.status !== "CANCELED" ? (
          <YStack flex={1} flexBasis={300} minWidth={0} gap="$3" backgroundColor={brand.gesso} borderRadius={radiusDoc} padding="$4">
            <XStack gap="$2" flexWrap="wrap">
              {phone ? (
                <a href={`tel:${phone.replace(/\s+/g, "")}`} style={{ textDecoration: "none", flex: 1, minWidth: 130, display: "flex" }}>
                  <CardButton tone={stripAction ? "outline" : "primary"} flex={1}>
                    <XStack alignItems="center" gap="$2">
                      <Icon name="phone" size={18} color={stripAction ? brand.grafite : "white"} />
                      <Text fontFamily="$body" fontWeight="600" fontSize="$3" color={stripAction ? brand.grafite : "white"}>
                        Chiama
                      </Text>
                    </XStack>
                  </CardButton>
                </a>
              ) : null}
              {booking.guidedRequestId && !proGone ? (
                <CardButton
                  flex={1}
                  minWidth={130}
                  onPress={() => {
                    setShowTimeline(true);
                    dismissUnread();
                  }}
                >
                  <XStack alignItems="center" gap="$2">
                    <Icon name="message-circle" size={18} color={brand.grafite} />
                    <Text fontFamily="$body" fontWeight="600" fontSize="$3" color={brand.grafite}>
                      Messaggi
                    </Text>
                    <UnreadDot count={effectiveUnreadCount} />
                  </XStack>
                </CardButton>
              ) : null}
            </XStack>
            {priceText || booking.payment ? <YStack height={1} backgroundColor={brand.filetto} /> : null}
            {priceText && booking.status !== "COMPLETED" ? (
              <XStack justifyContent="space-between" alignItems="baseline" gap="$2" flexWrap="wrap">
                <Text fontSize={16} color={brand.grafite70}>
                  Totale indicativo
                </Text>
                <Text fontSize={18} fontWeight="800" color={brand.grafite}>
                  {priceText}
                </Text>
              </XStack>
            ) : null}
            {/* Pagamento del lavoro (docs/CHANGELOG.md §168). */}
            {booking.payment ? (
              <JobPaymentStatus
                payment={booking.payment}
                audience="client"
                onPay={async (part) => {
                  const { url } = await apiClient.jobPaymentCheckout(token, booking.id, part);
                  if (url) window.location.href = url;
                }}
              />
            ) : null}
          </YStack>
        ) : null}
      </XStack>

      {/* Solo ciò che ha annullato il cliente: un intervento annullato dal professionista non si riapre. */}
      {booking.status === "CANCELED" && booking.canceledBy === "CLIENT" ? (
        <XStack gap="$2" alignItems="center" flexWrap="wrap">
          <CardButton onPress={handleReopenBooking} disabled={isReopening}>
            {isReopening ? "Riapertura..." : "Riapri prenotazione"}
          </CardButton>
        </XStack>
      ) : booking.status === "CANCELED" ? (
        <Text fontSize={16} color={brand.grafite70}>
          Il professionista ha annullato questo intervento, quindi non si può riaprire. Con &ldquo;Ripeti la richiesta&rdquo; puoi inviarla
          ad altri professionisti della zona.
        </Text>
      ) : null}
      {reopenError ? (
        <Text color={brand.urgenza} fontSize={16}>
          {reopenError}
        </Text>
      ) : null}

      {booking.issue ? (
        <YStack gap="$1" paddingTop="$1" borderTopWidth={1} borderTopColor={brand.filetto}>
          <Text fontSize={13} fontWeight="600" color={booking.issue.status === "REJECTED" || booking.issue.status === "RESOLVED" ? brand.grafite : brand.urgenza}>
            Hai segnalato: {JOB_ISSUE_LABEL[booking.issue.type].toLowerCase()} · {JOB_ISSUE_STATUS_LABEL[booking.issue.status]}
          </Text>
          <ClientIssueStatus
            booking={booking}
            busy={issueBusy}
            error={issueError}
            onOpenChat={booking.guidedRequestId ? () => setShowTimeline(true) : null}
            onCloseChat={closeIssueChat}
            onRedispatch={redispatch}
          />
        </YStack>
      ) : booking.status === "CONFIRMED" && booking.refundRequested ? (
        <YStack gap="$1" paddingTop="$1" borderTopWidth={1} borderTopColor={brand.filetto}>
          <Text fontSize={13} fontWeight="600" color={brand.urgenza}>
            Hai segnalato la mancata presentazione
          </Text>
        </YStack>
      ) : null}

      {booking.status === "COMPLETED" && booking.finalAmountEurCents !== null ? (
        <YStack gap="$1" paddingTop="$1" borderTopWidth={1} borderTopColor={brand.filetto}>
          <Text fontSize={13} fontWeight="600" color={brand.grafite}>
            Importo finale
          </Text>
          {booking.finalItems.map((item) => (
            <XStack key={item.id} justifyContent="space-between" gap="$2">
              <Text fontSize={13} color={brand.grafite70}>
                {item.name}
              </Text>
              <Text fontSize={13} color={brand.grafite}>
                {formatEurCents(item.priceEurCents)}
              </Text>
            </XStack>
          ))}
          <XStack justifyContent="space-between" gap="$2">
            <Text fontSize={13} fontWeight="700" color={brand.grafite}>
              Totale
            </Text>
            <Text fontSize={13} fontWeight="700" color={brand.cianografiaScuro}>
              {formatEurCents(booking.finalAmountEurCents)}
            </Text>
          </XStack>
          {booking.completionChangeReason ? (
            <Text fontSize={13} color={brand.grafite70}>
              Perché è diverso dal preventivo: {booking.completionChangeReason}
            </Text>
          ) : null}
        </YStack>
      ) : null}

      {booking.status === "CANCELED" && booking.cancellationNote ? (
        <YStack gap="$1" paddingTop="$1" borderTopWidth={1} borderTopColor={brand.filetto}>
          <Text fontSize={13} fontWeight="600" color={brand.grafite}>
            Nota del professionista
          </Text>
          <Text fontSize={13} color={brand.grafite70}>
            {booking.cancellationNote}
          </Text>
        </YStack>
      ) : null}

      {booking.status === "CONFIRMED" || booking.status === "COMPLETED" ? (
        booking.hasReview ? (
          <Text fontSize={13} color={brand.verificato} fontWeight="600">
            Recensione inviata
          </Text>
        ) : !booking.canReview && (booking.issue?.status === "OPEN" || booking.issue?.status === "CHAT") ? (
          <Text fontSize={13} color={brand.grafite70}>
            Potrai lasciare la recensione quando la segnalazione sarà chiusa.
          </Text>
        ) : null
      ) : null}

      {/* Elimina sempre per ultimo (richiesta esplicita dell'utente). */}
      {booking.professionalAccountDeleted ? (
        <XStack gap="$2" alignItems="center" flexWrap="wrap" paddingTop="$1" borderTopWidth={1} borderTopColor={brand.filetto}>
          {confirmingDeleteBooking ? (
            <>
              <Text fontSize={13} color={brand.urgenza}>
                Eliminare questa prenotazione dalla lista?
              </Text>
              <CardButton tone="dangerSolid" onPress={handleDeleteBooking} disabled={isDeletingBooking}>
                {isDeletingBooking ? "Eliminazione..." : "Conferma"}
              </CardButton>
              <CardButton onPress={() => setConfirmingDeleteBooking(false)}>Annulla</CardButton>
            </>
          ) : (
            <CardButton tone="danger" onPress={() => setConfirmingDeleteBooking(true)}>
              Elimina prenotazione
            </CardButton>
          )}
        </XStack>
      ) : null}
      {deleteError ? (
        <Text color={brand.urgenza} fontSize={16}>
          {deleteError}
        </Text>
      ) : null}


      {showClientCompleteModal ? (
        <ClientCompleteModal
          directPayment={booking.payment?.method === "DIRECT"}
          onClose={() => setShowClientCompleteModal(false)}
          onConfirm={handleClientConfirmComplete}
        />
      ) : null}
      {showReviewModal ? (
        <ReviewModal
          title="Recensisci il professionista"
          subtitle="Com'è andato il lavoro? Raccontalo ora, finché è fresco."
          uploadPhoto={(file) => apiClient.uploadReviewPhoto(token, file).then((r) => r.imageUrl)}
          onSubmit={handleSubmitReview}
          onClose={closeReviewModal}
        />
      ) : null}

      {showTimeline && booking.guidedRequestId ? (
        <TimelineModal token={token} guidedRequestId={booking.guidedRequestId} professionalProfileId={booking.professionalProfileId} viewerRole="CLIENT" otherPartyName={booking.businessName} otherPartyImageUrl={booking.professionalImageUrl} onClose={() => setShowTimeline(false)} />
      ) : null}
    </YStack>
  );
}

/** L'appuntamento deve ancora cominciare: calendario, cambio data e annullamento hanno senso solo prima (§344). */
function isUpcoming(moment: AppointmentMoment | null): boolean {
  return moment !== null && moment.kind !== "inProgress" && moment.kind !== "over";
}

/**
 * "Serve cambiare? Scrivi un messaggio · Annulla appuntamento" sotto la
 * trattativa chiusa (§344): solo prima dell'appuntamento, quando il
 * professionista c'è ancora. Dopo, per qualcosa che non va c'è "C'è un problema".
 */
export function ChangeLinks({ booking, onMessage, onCancel }: { booking: ClientBooking; onMessage: (() => void) | null; onCancel: () => void }) {
  const moment = useAppointmentMoment(booking);
  if ((booking.status !== "CONFIRMED" && booking.status !== "PENDING") || booking.professionalAccountDeleted || !isUpcoming(moment)) return null;
  return (
    <XStack alignItems="center" gap="$4" flexWrap="wrap" paddingHorizontal="$1" paddingTop="$1">
      <Text fontSize={16} color={brand.grafite70}>
        Serve cambiare?
      </Text>
      {onMessage ? (
        <Text fontSize={16} fontWeight="600" color={brand.grafite} textDecorationLine="underline" cursor="pointer" accessibilityRole="button" onPress={onMessage}>
          Scrivi un messaggio
        </Text>
      ) : null}
      <Text fontSize={16} fontWeight="600" color={brand.urgenza} textDecorationLine="underline" cursor="pointer" accessibilityRole="button" onPress={onCancel}>
        Annulla appuntamento
      </Text>
    </XStack>
  );
}
