"use client";

import { useState } from "react";
import Link from "next/link";
import type { ClientBooking } from "@professionisti/api-client";
import { Icon, Text, XStack, YStack, brand, radiusDoc } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";
import { cancellationNoticeLabel, JOB_ISSUE_LABEL, JOB_ISSUE_STATUS_LABEL, formatEurCents, formatServicePriceRange, quotePriceTotals, type AppointmentMoment } from "@professionisti/shared";
import { AppointmentWhen, useAppointmentMoment } from "./AppointmentWhen";
import { AddToCalendar } from "./AddToCalendar";
import { WhatsAppReminderLink } from "@/components/WhatsAppReminderLink";
import { UnreadDot } from "@/components/UnreadDot";
import { ClientIssueStatus } from "./ClientIssueStatus";
import { JobPaymentStatus } from "@/components/JobPaymentStatus";
import { TimelineModal } from "@/components/TimelineModal";
import { ClientCompleteModal } from "@/components/ClientCompleteModal";
import { ReviewModal } from "@/components/ReviewModal";
import { CardButton } from "@/components/CardButton";
import { CancelBookingModal } from "@/components/CancelBookingModal";
import { useDismissableUnreadCount } from "@/lib/useDismissableUnreadCount";

/**
 * Il lavoro nato dal preventivo accettato, in cima alla scheda come un
 * biglietto dell'appuntamento (docs/CHANGELOG.md §346, variante C scelta
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
  rebookHref,
}: {
  booking: ClientBooking;
  token: string;
  onChanged: () => void;
  unreadCount?: number;
  /** Dove si svolge il lavoro (dalla richiesta), null per una consulenza online. */
  address: string | null;
  /** "C'è un problema" dopo l'orario: apre la segnalazione della scheda. Null se non si può segnalare. */
  onReportProblem: (() => void) | null;
  /** "Prenota di nuovo": nuova richiesta allo stesso professionista con indirizzo e contatti già scritti (docs/CHANGELOG.md §348). */
  rebookHref?: string;
}) {
  const [showClientCompleteModal, setShowClientCompleteModal] = useState(false);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [showUpdateReviewModal, setShowUpdateReviewModal] = useState(false);
  const [isReopening, setIsReopening] = useState(false);
  const [confirmReopen, setConfirmReopen] = useState(false);
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

  async function handleAnswerReopen(accept: boolean) {
    setReopenError(null);
    setIsReopening(true);
    try {
      await apiClient.answerReopenBooking(token, booking.id, accept);
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

  async function handleUpdateReview(input: { rating: number; comment?: string; mediaUrls: string[] }) {
    if (!booking.myReview) return;
    await apiClient.updateReview(token, booking.myReview.id, { rating: input.rating, comment: input.comment, photoUrls: input.mediaUrls });
    setShowUpdateReviewModal(false);
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

  // Rimborso proposto dal professionista in chat (collaudo F-03).
  async function acceptIssueRefund() {
    setIssueError(null);
    setIssueBusy(true);
    try {
      await apiClient.acceptJobIssueRefund(token, booking.id);
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
  // "Lavoro terminato" solo da quando l'appuntamento è iniziato (§346):
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
          {upcoming ? <WhatsAppReminderLink token={token} /> : null}
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
                issueOpen={issueOpen}
                onPay={async (part) => {
                  const { url } = await apiClient.jobPaymentCheckout(token, booking.id, part);
                  if (url) window.location.href = url;
                }}
              />
            ) : null}
          </YStack>
        ) : null}
      </XStack>

      {/* Chi ha annullato chiede di riaprire, l'altro accetta (collaudo F-08). */}
      {booking.status === "CANCELED" && booking.canceledBy === "CLIENT" && booking.reopenRequestedBy === "CLIENT" ? (
        <Text fontSize={16} color={brand.grafite70}>
          Hai chiesto di riaprire l&apos;appuntamento: aspetta la risposta di {booking.businessName}.
        </Text>
      ) : booking.status === "CANCELED" && booking.canceledBy === "CLIENT" ? (
        <XStack gap="$2" alignItems="center" flexWrap="wrap">
          <CardButton onPress={() => setConfirmReopen(true)} disabled={isReopening}>
            {isReopening ? "Invio..." : "Chiedi di riaprire"}
          </CardButton>
        </XStack>
      ) : booking.status === "CANCELED" && booking.reopenRequestedBy === "PROFESSIONAL" ? (
        <YStack gap="$2">
          <Text fontSize={16} color={brand.grafite}>
            {booking.businessName} chiede di riaprire l&apos;appuntamento annullato. Se accetti torna valido.
          </Text>
          <XStack gap="$2" alignItems="center" flexWrap="wrap">
            <CardButton onPress={() => handleAnswerReopen(true)} disabled={isReopening}>
              Accetta
            </CardButton>
            <CardButton tone="danger" onPress={() => handleAnswerReopen(false)} disabled={isReopening}>
              Rifiuta
            </CardButton>
          </XStack>
        </YStack>
      ) : booking.status === "CANCELED" ? (
        <Text fontSize={16} color={brand.grafite70}>
          Il professionista ha annullato questo intervento, quindi non si può riaprire. Con &ldquo;Ripeti la richiesta&rdquo; puoi inviarla
          ad altri professionisti della zona.
        </Text>
      ) : null}
      {/* Che fine fa l'acconto pagato online dopo l'annullamento (collaudo F-02). */}
      {booking.status === "CANCELED" && booking.payment?.method === "ONLINE" && booking.payment.paidEurCents > 0 ? (
        <JobPaymentStatus payment={booking.payment} audience="client" />
      ) : null}
      {/* Conferma prima di riaprire (collaudo F-08). */}
      {confirmReopen ? (
        <CancelBookingModal
          title="Chiedere di riaprire?"
          description={`${booking.businessName} riceve la richiesta: se accetta, l'appuntamento torna valido.${
            booking.payment?.method === "ONLINE" && booking.payment.stage === "REFUNDED" ? " L'acconto che ti avevamo rimborsato va pagato di nuovo." : ""
          }`}
          confirmLabel="Chiedi di riaprire"
          confirmingLabel="Invio..."
          backLabel="Torna indietro"
          confirmVariant="primary"
          showNote={false}
          onClose={() => setConfirmReopen(false)}
          onCancel={async () => {
            setConfirmReopen(false);
            await handleReopenBooking();
          }}
        />
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
            onAcceptRefund={() => void acceptIssueRefund()}
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
        // A 16 px come il resto della scheda: a 13 era la tabella meno leggibile (docs/CHANGELOG.md §349).
        <YStack gap="$1" paddingTop="$1" borderTopWidth={1} borderTopColor={brand.filetto}>
          <Text fontSize={16} fontWeight="600" color={brand.grafite}>
            Importo finale
          </Text>
          {booking.finalItems.map((item) => (
            <XStack key={item.id} justifyContent="space-between" gap="$2">
              <Text fontSize={16} color={brand.grafite70}>
                {item.name}
              </Text>
              <Text fontSize={16} color={brand.grafite}>
                {formatEurCents(item.priceEurCents)}
              </Text>
            </XStack>
          ))}
          <XStack justifyContent="space-between" gap="$2">
            <Text fontSize={16} fontWeight="700" color={brand.grafite}>
              Totale
            </Text>
            <Text fontSize={16} fontWeight="700" color={brand.cianografiaScuro}>
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
          <YStack gap="$2" alignItems="flex-start">
            {/* Grigio con la spunta: in verde sembrava un link (docs/CHANGELOG.md §349). */}
            <XStack alignItems="center" gap="$1">
              <Icon name="check" size={14} color={brand.grafite70} strokeWidth={2} />
              <Text fontSize={13} color={brand.grafite70} fontWeight="600">
                Recensione inviata
              </Text>
            </XStack>
            {/* Una volta sola, dopo una segnalazione a lavoro chiuso senza accordo (decisione di Luca del 30/10/2026). */}
            {booking.canUpdateReview ? (
              <YStack gap="$1" alignItems="flex-start">
                <Text fontSize={13} color={brand.grafite70}>
                  Non vi siete accordati sul problema: puoi aggiornare la recensione una volta, perché anche gli altri clienti lo sappiano.
                </Text>
                <CardButton tone="primary" onPress={() => setShowUpdateReviewModal(true)}>
                  Aggiorna la recensione
                </CardButton>
              </YStack>
            ) : null}
            {/* Il prossimo lavoro con lo stesso professionista passa dal sito (docs/CHANGELOG.md §348). */}
            {rebookHref && booking.status === "COMPLETED" && !booking.professionalAccountDeleted ? (
              <Link href={rebookHref} style={{ textDecoration: "none" }}>
                <CardButton tone="primary" arrow>
                  Prenota di nuovo
                </CardButton>
              </Link>
            ) : null}
          </YStack>
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

      {showUpdateReviewModal && booking.myReview ? (
        <ReviewModal
          title="Aggiorna la recensione"
          subtitle="Racconta cosa è successo dopo il lavoro. Puoi farlo una volta sola: sotto comparirà la data dell'aggiornamento."
          initial={{ rating: booking.myReview.rating, comment: booking.myReview.comment, mediaUrls: booking.myReview.photoUrls }}
          submitLabel="Aggiorna la recensione"
          uploadPhoto={(file) => apiClient.uploadReviewPhoto(token, file).then((r) => r.imageUrl)}
          onSubmit={handleUpdateReview}
          onClose={() => setShowUpdateReviewModal(false)}
        />
      ) : null}

      {showTimeline && booking.guidedRequestId ? (
        <TimelineModal token={token} guidedRequestId={booking.guidedRequestId} professionalProfileId={booking.professionalProfileId} viewerRole="CLIENT" otherPartyName={booking.businessName} otherPartyImageUrl={booking.professionalImageUrl} onClose={() => setShowTimeline(false)} />
      ) : null}
    </YStack>
  );
}

/** L'appuntamento deve ancora cominciare: calendario, cambio data e annullamento hanno senso solo prima (§346). */
function isUpcoming(moment: AppointmentMoment | null): boolean {
  return moment !== null && moment.kind !== "inProgress" && moment.kind !== "over";
}

/**
 * "Serve cambiare? Proponi un'altra data · Scrivi un messaggio · Annulla appuntamento" sotto la
 * trattativa chiusa (§346): solo prima dell'appuntamento, quando il
 * professionista c'è ancora. Dopo, per qualcosa che non va c'è "C'è un problema".
 */
export function ChangeLinks({ booking, onReschedule, onMessage, onCancel }: { booking: ClientBooking; onReschedule: (() => void) | null; onMessage: (() => void) | null; onCancel: () => void }) {
  const moment = useAppointmentMoment(booking);
  if ((booking.status !== "CONFIRMED" && booking.status !== "PENDING") || booking.professionalAccountDeleted || !isUpcoming(moment)) return null;
  return (
    <YStack gap="$1" paddingHorizontal="$1" paddingTop="$1">
    <XStack alignItems="center" gap="$4" flexWrap="wrap">
      <Text fontSize={16} color={brand.grafite70}>
        Serve cambiare?
      </Text>
      {/* "Non posso più" → un'altra data invece di perdere l'appuntamento (docs/changelog/2026-10-28-promemoria-whatsapp.md). */}
      {onReschedule && booking.status === "CONFIRMED" ? (
        <Text fontSize={16} fontWeight="600" color={brand.grafite} textDecorationLine="underline" cursor="pointer" accessibilityRole="button" onPress={onReschedule}>
          Proponi un&apos;altra data
        </Text>
      ) : null}
      {onMessage ? (
        <Text fontSize={16} fontWeight="600" color={brand.grafite} textDecorationLine="underline" cursor="pointer" accessibilityRole="button" onPress={onMessage}>
          Scrivi un messaggio
        </Text>
      ) : null}
      <Text fontSize={16} fontWeight="600" color={brand.urgenza} textDecorationLine="underline" cursor="pointer" accessibilityRole="button" onPress={onCancel}>
        Annulla appuntamento
      </Text>
    </XStack>
      {/* Preavviso scelto dal professionista (docs/CHANGELOG.md §347). */}
      <Text fontSize={13} color={brand.grafite70}>
        Se devi annullare, avvisa almeno {cancellationNoticeLabel(booking.cancellationNoticeHours)} prima.
        {booking.lateCancelKeepsDeposit && booking.payment?.method === "ONLINE" && booking.payment.paidEurCents > 0 ? " Più tardi, l'acconto resta al professionista." : ""}
      </Text>
    </YStack>
  );
}
