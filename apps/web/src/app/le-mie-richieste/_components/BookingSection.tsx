"use client";

import { useState } from "react";
import type { ClientBooking } from "@professionisti/api-client";
import { Button, Icon, Text, XStack, YStack, brand } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";
import { ReportIssueModal } from "@/components/ReportIssueModal";
import { JOB_ISSUE_LABEL, JOB_ISSUE_STATUS_LABEL } from "@professionisti/shared";
import { TimelineModal } from "@/components/TimelineModal";
import { ClientCompleteModal } from "@/components/ClientCompleteModal";
import { ReviewModal } from "@/components/ReviewModal";
import { UnreadDot } from "@/components/UnreadDot";
import { useDismissableUnreadCount } from "@/lib/useDismissableUnreadCount";
import { GuidedRequestCard } from "./GuidedRequestCard";

/**
 * Dettagli/azioni propri della prenotazione (nata dal preventivo accettato)
 * — estratto dalla vecchia `BookingRow`, senza più il proprio header (già
 * mostrato in `GuidedRequestCard`) né la ripetizione di categoria/
 * descrizione/foto/voci del preventivo (già visibili più sopra nella stessa
 * card, essendo la stessa identica richiesta: booking/quote li denormalizzano
 * ma restano gli stessi dati, mostrarli due volte sarebbe stato ridondante
 * ora che le due liste sono un'unica card).
 */
export function BookingSection({ booking, token, onChanged, unreadCount }: { booking: ClientBooking; token: string; onChanged: () => void; unreadCount?: number }) {
  const [showClientCompleteModal, setShowClientCompleteModal] = useState(false);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [isReopening, setIsReopening] = useState(false);
  const [reopenError, setReopenError] = useState<string | null>(null);
  const [showNoShowModal, setShowNoShowModal] = useState(false);
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

  async function handleClientConfirmComplete(photoUrls: string[], note: string | undefined) {
    await apiClient.clientConfirmComplete(token, booking.id, { photoUrls, note });
    setShowClientCompleteModal(false);
    if (booking.status === "COMPLETED" && !booking.hasReview) {
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

  // Segnalazioni (docs/CHANGELOG.md §164): quali si possono inviare lo decide il server.
  const canReportIssue = booking.issueTypesAllowed.length > 0;

  return (
    <YStack gap="$2" borderTopWidth={1} borderTopColor={brand.filetto} paddingTop="$3">
      <Text fontFamily="$body" fontSize={11} fontWeight="700" color={brand.grafite70} textTransform="uppercase">
        Intervento
      </Text>
      <Text color={brand.grafite70} fontSize="$3">
        {new Date(booking.scheduledAt).toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" })}
        {" · "}
        {new Date(booking.scheduledAt).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}
        {booking.scheduledEndAt ? `–${new Date(booking.scheduledEndAt).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}` : ""}
      </Text>

      {booking.guidedRequestId ? (
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
      ) : null}

      {booking.meetingLink ? (
        <a href={booking.meetingLink} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>
          <XStack alignItems="center" gap="$2">
            <Icon name="video" size={14} color={brand.cianografia} strokeWidth={1.5} />
            <Text fontSize="$3" color={brand.cianografia} fontWeight="600">
              Partecipa alla videochiamata
            </Text>
          </XStack>
        </a>
      ) : null}

      {booking.status === "CANCELED" ? (
        <XStack gap="$2" alignItems="center" flexWrap="wrap">
          <Button variant="secondary" size="$2" height={36} onPress={handleReopenBooking} disabled={isReopening} opacity={isReopening ? 0.6 : 1}>
            {isReopening ? "Riapertura..." : "Riapri prenotazione"}
          </Button>
        </XStack>
      ) : null}
      {reopenError ? (
        <Text color={brand.urgenza} fontSize="$3">
          {reopenError}
        </Text>
      ) : null}

      {canReportIssue ? (
        <Text color={brand.urgenza} fontWeight="600" fontSize="$3" cursor="pointer" accessibilityRole="button" onPress={() => setShowNoShowModal(true)}>
          Segnala un problema
        </Text>
      ) : null}

      {booking.issue ? (
        <YStack gap="$1" paddingTop="$1" borderTopWidth={1} borderTopColor={brand.filetto}>
          <Text fontSize="$2" fontWeight="600" color={booking.issue.status === "REJECTED" || booking.issue.status === "RESOLVED" ? brand.grafite : brand.urgenza}>
            Hai segnalato: {JOB_ISSUE_LABEL[booking.issue.type].toLowerCase()} · {JOB_ISSUE_STATUS_LABEL[booking.issue.status]}
          </Text>
          {booking.issue.status === "CHAT" ? (
            <YStack gap="$2">
              <Text fontSize="$2" color={brand.grafite70}>
                Prova a trovare una soluzione con {booking.businessName} in chat. Se non vi accordate, chiedi al nostro team di decidere.
              </Text>
              <XStack gap="$2" flexWrap="wrap">
                {booking.guidedRequestId ? (
                  <Button variant="primary" size="$2" height={36} onPress={() => setShowTimeline(true)}>
                    Apri la chat
                  </Button>
                ) : null}
                <Button variant="secondary" size="$2" height={36} disabled={issueBusy} opacity={issueBusy ? 0.6 : 1} onPress={() => closeIssueChat("RESOLVED")}>
                  Abbiamo risolto
                </Button>
                <Button variant="ghost" size="$2" height={36} disabled={issueBusy} opacity={issueBusy ? 0.6 : 1} onPress={() => closeIssueChat("ESCALATE")}>
                  Non abbiamo risolto: fai decidere al vostro team
                </Button>
              </XStack>
              {issueError ? (
                <Text fontSize="$2" color={brand.urgenza}>
                  {issueError}
                </Text>
              ) : null}
            </YStack>
          ) : booking.issue.status === "RESOLVED" ? (
            <Text fontSize="$2" color={brand.grafite70}>
              Hai indicato che avete risolto il problema con {booking.businessName}.
            </Text>
          ) : booking.issue.status === "OPEN" ? (
            <Text fontSize="$2" color={brand.grafite70}>
              Il nostro team la sta esaminando e ha avvisato {booking.businessName}. Ti comunichiamo la decisione qui e per notifica.
            </Text>
          ) : booking.issue.resolutionNote ? (
            <Text fontSize="$2" color={brand.grafite70}>
              Decisione: {booking.issue.resolutionNote}
            </Text>
          ) : null}
        </YStack>
      ) : booking.status === "CONFIRMED" && booking.refundRequested ? (
        <YStack gap="$1" paddingTop="$1" borderTopWidth={1} borderTopColor={brand.filetto}>
          <Text fontSize="$2" fontWeight="600" color={brand.urgenza}>
            Hai segnalato la mancata presentazione
          </Text>
        </YStack>
      ) : null}

      {booking.status === "COMPLETED" && booking.finalAmountEurCents !== null ? (
        <YStack gap="$1" paddingTop="$1" borderTopWidth={1} borderTopColor={brand.filetto}>
          <Text fontSize="$2" fontWeight="600" color={brand.grafite}>
            Importo finale
          </Text>
          {booking.finalItems.map((item) => (
            <XStack key={item.id} justifyContent="space-between" gap="$2">
              <Text fontSize="$2" color={brand.grafite70}>
                {item.name}
              </Text>
              <Text fontSize="$2" color={brand.grafite}>
                €{(item.priceEurCents / 100).toFixed(2)}
              </Text>
            </XStack>
          ))}
          <XStack justifyContent="space-between" gap="$2">
            <Text fontSize="$2" fontWeight="700" color={brand.grafite}>
              Totale
            </Text>
            <Text fontSize="$2" fontWeight="700" color={brand.cianografia}>
              €{(booking.finalAmountEurCents / 100).toFixed(2)}
            </Text>
          </XStack>
        </YStack>
      ) : null}

      {booking.status === "CANCELED" && booking.cancellationNote ? (
        <YStack gap="$1" paddingTop="$1" borderTopWidth={1} borderTopColor={brand.filetto}>
          <Text fontSize="$2" fontWeight="600" color={brand.grafite}>
            Nota del professionista
          </Text>
          <Text fontSize="$2" color={brand.grafite70}>
            {booking.cancellationNote}
          </Text>
        </YStack>
      ) : null}

      {booking.professionalAccountDeleted ? (
        <XStack gap="$2" alignItems="center" flexWrap="wrap" paddingTop="$1" borderTopWidth={1} borderTopColor={brand.filetto}>
          {confirmingDeleteBooking ? (
            <>
              <Text fontSize="$2" color={brand.urgenza}>
                Eliminare questa prenotazione dalla lista?
              </Text>
              <Button variant="urgent" size="$2" height={36} onPress={handleDeleteBooking} disabled={isDeletingBooking} opacity={isDeletingBooking ? 0.6 : 1}>
                {isDeletingBooking ? "Eliminazione..." : "Conferma"}
              </Button>
              <Button variant="ghost" size="$2" height={36} onPress={() => setConfirmingDeleteBooking(false)}>
                Annulla
              </Button>
            </>
          ) : (
            <Text color={brand.urgenza} fontWeight="600" fontSize="$2" cursor="pointer" accessibilityRole="button" onPress={() => setConfirmingDeleteBooking(true)}>
              Elimina prenotazione
            </Text>
          )}
        </XStack>
      ) : null}
      {deleteError ? (
        <Text color={brand.urgenza} fontSize="$3">
          {deleteError}
        </Text>
      ) : null}

      {showNoShowModal ? (
        <ReportIssueModal
          businessName={booking.businessName}
          phone={booking.professionalPhone}
          email={booking.professionalEmail}
          allowedTypes={booking.issueTypesAllowed}
          onClose={() => {
            setShowNoShowModal(false);
            onChanged();
          }}
          onSubmit={async (input) => {
            await apiClient.reportJobIssue(token, booking.id, input);
          }}
          onOpenChat={
            booking.guidedRequestId
              ? () => {
                  setShowNoShowModal(false);
                  setShowTimeline(true);
                  onChanged();
                }
              : undefined
          }
          uploadPhoto={(file) => apiClient.uploadBookingCompletionPhoto(token, file).then((r) => r.imageUrl)}
        />
      ) : null}

      {booking.status === "CONFIRMED" || booking.status === "COMPLETED" ? (
        <YStack gap="$2" paddingTop="$2" borderTopWidth={1} borderTopColor={brand.filetto}>
          {booking.hasReview ? (
            <Text fontSize="$2" color={brand.verificato} fontWeight="600">
              Recensione inviata
            </Text>
          ) : booking.canReview ? (
            <Button variant="secondary" size="$3" height={40} alignSelf="flex-start" onPress={() => setShowReviewModal(true)}>
              Lascia una recensione
            </Button>
          ) : booking.issue?.status === "OPEN" || booking.issue?.status === "CHAT" ? (
            <Text fontSize="$2" color={brand.grafite70}>
              Potrai lasciare la recensione quando la segnalazione sarà chiusa.
            </Text>
          ) : !booking.clientConfirmedCompletedAt ? (
            <Button variant="primary" size="$3" height={40} alignSelf="flex-start" onPress={() => setShowClientCompleteModal(true)}>
              Lavoro terminato
            </Button>
          ) : booking.status !== "COMPLETED" ? (
            <Text fontSize="$2" color={brand.grafite70}>
              Hai confermato il completamento. In attesa che anche il professionista lo segnali per poter lasciare una recensione.
            </Text>
          ) : null}
        </YStack>
      ) : null}

      {showClientCompleteModal ? (
        <ClientCompleteModal
          onClose={() => setShowClientCompleteModal(false)}
          onConfirm={handleClientConfirmComplete}
          uploadPhoto={(file) => apiClient.uploadBookingCompletionPhoto(token, file).then((r) => r.imageUrl)}
          onReportProblem={
            canReportIssue
              ? () => {
                  setShowClientCompleteModal(false);
                  setShowNoShowModal(true);
                }
              : undefined
          }
        />
      ) : null}
      {showReviewModal ? (
        <ReviewModal
          title="Recensisci il professionista"
          subtitle="Com'è andato il lavoro? La tua recensione sarà pubblica non appena anche il professionista avrà lasciato la sua."
          uploadPhoto={(file) => apiClient.uploadReviewPhoto(token, file).then((r) => r.imageUrl)}
          onSubmit={handleSubmitReview}
          onClose={closeReviewModal}
        />
      ) : null}

      {showTimeline && booking.guidedRequestId ? (
        <TimelineModal token={token} guidedRequestId={booking.guidedRequestId} professionalProfileId={booking.professionalProfileId} viewerRole="CLIENT" otherPartyName={booking.businessName} onClose={() => setShowTimeline(false)} />
      ) : null}
    </YStack>
  );
}
