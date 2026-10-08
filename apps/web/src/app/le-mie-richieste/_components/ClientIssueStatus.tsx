"use client";

import Link from "next/link";
import type { ClientBooking } from "@professionisti/api-client";
import { jobIssueOutcomeText } from "@professionisti/shared";
import { Text, XStack, YStack, brand } from "@professionisti/ui";
import { CardButton } from "@/components/CardButton";
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
            ? `Hai scelto il pagamento diretto: scrivi a ${pro} in chat per trovare insieme una soluzione. In questo caso non possiamo rimborsarti né decidere noi, ma potrai sempre lasciare la recensione.`
            : issue.proRepliedInChat
            ? `${pro} ti ha risposto in chat. Se non trovate un accordo, chiedi al nostro team di decidere.`
            : `${pro} ha tempo fino a ${formatIssueDeadline(issue.chatReplyDueAt)} per risponderti in chat e proporti una soluzione. Se non risponde, la segnalazione passa da sola al nostro team.`}
        </Text>
        <XStack gap="$2" flexWrap="wrap">
          {onOpenChat ? (
            <CardButton tone="primary" onPress={onOpenChat}>
              Apri la chat
            </CardButton>
          ) : null}
          <CardButton disabled={busy} onPress={() => onCloseChat("RESOLVED")}>
            Abbiamo risolto
          </CardButton>
          {issue.canEscalate ? (
            <CardButton disabled={busy} onPress={() => onCloseChat("ESCALATE")}>
              Non abbiamo risolto
            </CardButton>
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
          Non avete trovato un accordo con {pro}. Puoi lasciare la recensione per raccontare com&apos;è andata.
        </Text>
        {issue.canRedispatch ? (
          <CardButton tone="primary" alignSelf="flex-start" disabled={busy} onPress={onRedispatch}>
            Invia la richiesta ad altri professionisti
          </CardButton>
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
          <CardButton tone="primary" alignSelf="flex-start" disabled={busy} onPress={onRedispatch}>
            Invia la richiesta ad altri professionisti
          </CardButton>
          <Text fontSize="$1" color={brand.grafite70}>
            La stessa richiesta, con descrizione e foto, arriva ad altri professionisti della zona. {pro} non la riceve.
          </Text>
        </YStack>
      ) : null}
      {issue.redispatchedGuidedRequestId ? (
        <YStack gap="$2" alignItems="flex-start">
          <Text fontSize="$2" fontWeight="600" color={brand.grafite70}>
            Hai inviato la richiesta ad altri professionisti.
          </Text>
          <Link href={`/le-mie-richieste?tab=richieste&open=${issue.redispatchedGuidedRequestId}`} style={{ textDecoration: "none" }}>
            <CardButton>Vedi i preventivi</CardButton>
          </Link>
        </YStack>
      ) : null}
      {errorText}
    </YStack>
  );
}
