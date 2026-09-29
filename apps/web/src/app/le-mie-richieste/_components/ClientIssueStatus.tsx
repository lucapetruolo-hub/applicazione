"use client";

import Link from "next/link";
import type { ClientBooking } from "@professionisti/api-client";
import { jobIssueOutcomeText } from "@professionisti/shared";
import { Button, Text, XStack, YStack, brand } from "@professionisti/ui";
import { formatIssueDeadline } from "@/lib/leadDeadline";

/**
 * Stato di una segnalazione dal lato del cliente, con le scadenze del
 * modello Amazon A-Z adattato a noi (docs/CHANGELOG.md §167): 48 ore al
 * professionista per rispondere in chat, 72 per la sua versione, poi la
 * nostra decisione entro 2 giorni. Dopo una mancata presentazione accolta,
 * il pulsante per inviare la stessa richiesta ad altri professionisti.
 */
export function ClientIssueStatus({
  booking,
  busy,
  error,
  onOpenChat,
  onCloseChat,
  onRedispatch,
}: {
  booking: ClientBooking;
  busy: boolean;
  error: string | null;
  onOpenChat: (() => void) | null;
  onCloseChat: (outcome: "RESOLVED" | "ESCALATE") => void;
  onRedispatch: () => void;
}) {
  const issue = booking.issue;
  if (!issue) return null;
  const pro = booking.businessName;
  const errorText = error ? (
    <Text fontSize="$2" color={brand.urgenza}>
      {error}
    </Text>
  ) : null;

  if (issue.status === "CHAT") {
    return (
      <YStack gap="$2">
        <Text fontSize="$2" color={brand.grafite70}>
          {!issue.assisted
            ? `Hai scelto il pagamento diretto: il problema va risolto con ${pro}. Scrivetevi in chat e cercate un accordo. Non possiamo rimborsarti né decidere per voi; accordo o no, potrai lasciare la recensione.`
            : issue.proRepliedInChat
            ? `${pro} ti ha risposto in chat. Se non trovate un accordo, chiedi al nostro team di decidere.`
            : `${pro} ha tempo fino a ${formatIssueDeadline(issue.chatReplyDueAt)} per risponderti in chat e proporti una soluzione. Se non risponde, la segnalazione passa da sola al nostro team.`}
        </Text>
        <XStack gap="$2" flexWrap="wrap">
          {onOpenChat ? (
            <Button variant="primary" size="$2" height={36} onPress={onOpenChat}>
              Apri la chat
            </Button>
          ) : null}
          <Button variant="secondary" size="$2" height={36} disabled={busy} opacity={busy ? 0.6 : 1} onPress={() => onCloseChat("RESOLVED")}>
            Abbiamo risolto
          </Button>
          {issue.canEscalate ? (
            <Button variant="ghost" size="$2" height={36} disabled={busy} opacity={busy ? 0.6 : 1} onPress={() => onCloseChat("ESCALATE")}>
              Non abbiamo risolto
            </Button>
          ) : null}
        </XStack>
        {errorText}
      </YStack>
    );
  }

  if (issue.status === "UNRESOLVED") {
    return (
      <YStack gap="$2">
        <Text fontSize="$2" color={brand.grafite70}>
          Non avete trovato un accordo con {pro}. Avendo scelto il pagamento diretto, la questione resta tra voi: puoi lasciare la recensione
          per raccontare com&apos;è andata.
        </Text>
        {issue.canRedispatch ? (
          <Button variant="primary" size="$2" height={36} alignSelf="flex-start" disabled={busy} opacity={busy ? 0.6 : 1} onPress={onRedispatch}>
            Invia la richiesta ad altri professionisti
          </Button>
        ) : null}
        {errorText}
      </YStack>
    );
  }

  if (issue.status === "RESOLVED") {
    return (
      <Text fontSize="$2" color={brand.grafite70}>
        Hai indicato che avete risolto il problema con {pro}.
      </Text>
    );
  }

  if (issue.status === "OPEN") {
    const due = formatIssueDeadline(issue.phaseDueAt);
    const text =
      issue.reviewPhase === "AWAITING_INFO"
        ? `Il nostro team ha chiesto altre informazioni a ${pro}, che ha tempo fino a ${due} per rispondere. Se non risponde, la segnalazione è accolta.`
        : issue.reviewPhase === "TO_DECIDE"
          ? `Il nostro team la sta esaminando e decide entro ${due}. Ti comunichiamo la decisione qui e per notifica.`
          : `Il nostro team la sta esaminando. ${pro} ha tempo fino a ${due} per inviare la sua versione: se non risponde, la segnalazione è accolta.`;
    return (
      <Text fontSize="$2" color={brand.grafite70}>
        {text}
      </Text>
    );
  }

  // Decisa (accolta o respinta), eventualmente dopo un ricorso del professionista.
  const appealAccepted = issue.appealDecision === "ACCEPTED";
  return (
    <YStack gap="$2">
      {issue.resolutionNote && !appealAccepted ? (
        <Text fontSize="$2" color={brand.grafite70}>
          {jobIssueOutcomeText({
            type: issue.type,
            decision: issue.status === "UPHELD" ? "UPHELD" : "REJECTED",
            note: issue.resolutionNote,
            audience: "client",
            paidOnline: issue.paidOnline,
          })}
        </Text>
      ) : null}
      {appealAccepted ? (
        <Text fontSize="$2" color={brand.grafite70}>
          {pro} ha fatto ricorso e un'altra persona del nostro team gli ha dato ragione: la segnalazione è respinta. Motivazione: {issue.appealNote}
        </Text>
      ) : null}
      {issue.canRedispatch ? (
        <YStack gap="$1">
          <Button variant="primary" size="$2" height={36} alignSelf="flex-start" disabled={busy} opacity={busy ? 0.6 : 1} onPress={onRedispatch}>
            Invia la richiesta ad altri professionisti
          </Button>
          <Text fontSize="$1" color={brand.grafite70}>
            La stessa richiesta, con descrizione e foto, arriva ad altri professionisti della zona. {pro} non la riceve.
          </Text>
        </YStack>
      ) : null}
      {issue.redispatchedGuidedRequestId ? (
        <Link href={`/le-mie-richieste?tab=richieste&open=${issue.redispatchedGuidedRequestId}`} style={{ textDecoration: "none" }}>
          <Text fontSize="$2" fontWeight="600" color={brand.ottone}>
            Hai inviato la richiesta ad altri professionisti: vedi i preventivi
          </Text>
        </Link>
      ) : null}
      {errorText}
    </YStack>
  );
}
