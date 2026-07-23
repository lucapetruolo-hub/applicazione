"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { ClientBooking, ClientGuidedRequest } from "@professionisti/api-client";
import { Button, H1, H2, Paragraph, Text, XStack, YStack } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/lib/AuthContext";
import { AccountSidebar } from "@/components/AccountSidebar";

const STATUS_LABEL: Record<ClientGuidedRequest["status"], string> = {
  OPEN: "In attesa di risposte",
  MATCHED: "Inviata ai professionisti",
  CLOSED: "Chiusa",
};

const BOOKING_STATUS_LABEL: Record<ClientBooking["status"], string> = {
  PENDING: "In attesa",
  CONFIRMED: "Confermata",
  COMPLETED: "Completata",
  CANCELED: "Annullata",
  NO_SHOW: "Non presentato",
};

export default function LeMieRichiestePage() {
  const { user, token, isLoading } = useAuth();
  const [requests, setRequests] = useState<ClientGuidedRequest[] | null>(null);
  const [bookings, setBookings] = useState<ClientBooking[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [acceptingQuoteId, setAcceptingQuoteId] = useState<string | null>(null);

  function reload() {
    if (!token) return;
    apiClient
      .myGuidedRequests(token)
      .then(setRequests)
      .catch((err) => setError(err instanceof Error ? err.message : "Errore nel caricamento delle richieste."));
    apiClient.myClientBookings(token).then(setBookings).catch(() => setBookings([]));
  }

  useEffect(reload, [token]);

  async function handleAcceptQuote(quoteId: string) {
    if (!token) return;
    setAcceptingQuoteId(quoteId);
    setError(null);
    try {
      await apiClient.acceptQuote(token, quoteId);
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore imprevisto, riprova.");
    } finally {
      setAcceptingQuoteId(null);
    }
  }

  if (isLoading) return null;

  if (!user || !token) {
    return (
      <YStack width="100%" alignItems="center" paddingVertical="$9" paddingHorizontal="$4">
        <YStack width="100%" maxWidth={480} gap="$4" alignItems="center">
          <H1 size="$7" textAlign="center">
            Accedi per vedere le tue richieste
          </H1>
          <Link href="/accedi?redirect=/le-mie-richieste" style={{ textDecoration: "none" }}>
            <Text color="$blue10" fontWeight="600">
              Vai al login
            </Text>
          </Link>
        </YStack>
      </YStack>
    );
  }

  return (
    <YStack width="100%" alignItems="center" paddingVertical="$8" paddingHorizontal="$4">
      <XStack width="100%" maxWidth={900} gap="$8" alignItems="flex-start" flexWrap="wrap">
        <AccountSidebar />

        <YStack flex={1} minWidth={280} gap="$6">
          <YStack gap="$5">
            <H1 size="$8">Le mie richieste</H1>

            {error ? <Text color="$red10">{error}</Text> : null}

            {requests === null ? (
              <Text color="$color9">Caricamento...</Text>
            ) : requests.length === 0 ? (
              <YStack gap="$3">
                <Paragraph color="$color10">Non hai ancora inviato nessuna richiesta di preventivo.</Paragraph>
                <Link href="/preventivo" style={{ textDecoration: "none" }}>
                  <Text color="$blue10" fontWeight="600">
                    Richiedi il tuo primo preventivo
                  </Text>
                </Link>
              </YStack>
            ) : (
              requests.map((request) => (
                <YStack
                  key={request.id}
                  borderWidth={1}
                  borderColor="$borderColor"
                  borderRadius="$5"
                  padding="$4"
                  gap="$3"
                >
                  <YStack flexDirection="row" justifyContent="space-between" alignItems="flex-start" flexWrap="wrap" gap="$2">
                    <YStack gap="$1">
                      <Text fontWeight="700" fontSize="$5">
                        {request.categoryLabel} · {request.city}
                      </Text>
                      <Text color="$color10">{request.description}</Text>
                    </YStack>
                    <Text fontSize="$2" color="$blue10" fontWeight="600">
                      {STATUS_LABEL[request.status]}
                    </Text>
                  </YStack>

                  {request.quotes.length > 0 ? (
                    <YStack gap="$2" borderTopWidth={1} borderTopColor="$borderColor" paddingTop="$3">
                      <H2 size="$4">Preventivi ricevuti</H2>
                      {request.quotes.map((quote) => (
                        <YStack key={quote.id} backgroundColor="$color2" borderRadius="$4" padding="$3" gap="$2">
                          <Text fontWeight="600">{quote.businessName}</Text>
                          <Text color="$color10" fontSize="$3">
                            Manodopera: €{(quote.laborEurCents / 100).toFixed(2)} · Materiali: €
                            {(quote.materialsEurCents / 100).toFixed(2)}
                          </Text>
                          {quote.notes ? (
                            <Text color="$color10" fontSize="$3">
                              {quote.notes}
                            </Text>
                          ) : null}
                          {quote.status === "SENT" ? (
                            <Button
                              size="$3"
                              alignSelf="flex-start"
                              onPress={() => handleAcceptQuote(quote.id)}
                              disabled={acceptingQuoteId === quote.id}
                              opacity={acceptingQuoteId === quote.id ? 0.6 : 1}
                            >
                              {acceptingQuoteId === quote.id ? "Conferma..." : "Accetta preventivo"}
                            </Button>
                          ) : quote.status === "ACCEPTED" ? (
                            <Text fontSize="$2" color="$green10" fontWeight="600">
                              Accettato
                            </Text>
                          ) : null}
                        </YStack>
                      ))}
                    </YStack>
                  ) : (
                    <Text color="$color9" fontSize="$3">
                      Nessun preventivo ricevuto ancora.
                    </Text>
                  )}
                </YStack>
              ))
            )}
          </YStack>

          <YStack gap="$5">
            <H1 size="$8">Le mie prenotazioni</H1>
            {bookings === null ? (
              <Text color="$color9">Caricamento...</Text>
            ) : bookings.length === 0 ? (
              <Paragraph color="$color10">Nessuna prenotazione ancora: accetta un preventivo per crearne una.</Paragraph>
            ) : (
              bookings.map((booking) => <BookingRow key={booking.id} booking={booking} token={token} onReviewed={reload} />)
            )}
          </YStack>
        </YStack>
      </XStack>
    </YStack>
  );
}

function BookingRow({ booking, token, onReviewed }: { booking: ClientBooking; token: string; onReviewed: () => void }) {
  const [showReviewForm, setShowReviewForm] = useState(false);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmitReview() {
    setError(null);
    setIsSubmitting(true);
    try {
      await apiClient.createReview(token, { bookingId: booking.id, rating, comment: comment.trim() || undefined });
      setShowReviewForm(false);
      onReviewed();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore imprevisto, riprova.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <YStack borderWidth={1} borderColor="$borderColor" borderRadius="$4" padding="$3" gap="$2">
      <YStack flexDirection="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap="$2">
        <Text fontWeight="600">{booking.businessName}</Text>
        <Text fontSize="$2" color="$blue10" fontWeight="600">
          {BOOKING_STATUS_LABEL[booking.status]}
        </Text>
      </YStack>
      <Text color="$color10" fontSize="$3">
        {new Date(booking.scheduledAt).toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" })}
      </Text>

      {booking.status === "COMPLETED" && !booking.hasReview ? (
        showReviewForm ? (
          <YStack gap="$2" paddingTop="$2" borderTopWidth={1} borderTopColor="$borderColor">
            <YStack flexDirection="row" gap="$1">
              {[1, 2, 3, 4, 5].map((value) => (
                <Text
                  key={value}
                  fontSize="$6"
                  cursor="pointer"
                  onPress={() => setRating(value)}
                  accessibilityRole="button"
                  accessibilityLabel={`${value} stelle`}
                >
                  {value <= rating ? "⭐" : "☆"}
                </Text>
              ))}
            </YStack>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Com'è andata? (opzionale)"
              rows={2}
              style={{ padding: 10, borderRadius: 8, border: "1px solid #d0d5dd", fontSize: 14, fontFamily: "inherit", resize: "vertical" }}
            />
            {error ? (
              <Text color="$red10" fontSize="$3">
                {error}
              </Text>
            ) : null}
            <Button size="$3" alignSelf="flex-start" onPress={handleSubmitReview} disabled={isSubmitting} opacity={isSubmitting ? 0.6 : 1}>
              {isSubmitting ? "Invio..." : "Invia recensione"}
            </Button>
          </YStack>
        ) : (
          <Button size="$3" alignSelf="flex-start" onPress={() => setShowReviewForm(true)}>
            Lascia una recensione
          </Button>
        )
      ) : booking.status === "COMPLETED" && booking.hasReview ? (
        <Text fontSize="$2" color="$green10" fontWeight="600">
          Recensione inviata
        </Text>
      ) : null}
    </YStack>
  );
}
