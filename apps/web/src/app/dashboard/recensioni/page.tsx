"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { ReceivedReview } from "@professionisti/api-client";
import { Button, Chip, EmptyState, Icon, Surface, Text, XStack, YStack, brand } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/lib/AuthContext";
import { MediaPreview } from "@/components/MediaPreview";
import { ReviewReply } from "@/components/ReviewReply";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" });
}

function Stars({ rating }: { rating: number }) {
  return (
    <XStack gap={2} accessibilityLabel={`${rating} stelle su 5`}>
      {[1, 2, 3, 4, 5].map((value) => (
        <Icon key={value} name="star" size={15} strokeWidth={1.5} color={brand.ottone} fill={value <= rating ? brand.ottone : "none"} />
      ))}
    </XStack>
  );
}

/**
 * "Recensioni" del professionista (decisione di Luca del 30/10/2026,
 * docs/changelog/2026-10-30-collaudo-soldi-online.md): tutte le recensioni
 * ricevute, con quelle senza risposta in evidenza e "Rispondi" accanto a
 * ognuna, nella sua area di lavoro invece che solo sul profilo pubblico.
 */
export default function DashboardRecensioniPage() {
  const { user, token, isLoading } = useAuth();
  const [reviews, setReviews] = useState<ReceivedReview[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [onlyUnanswered, setOnlyUnanswered] = useState(false);

  useEffect(() => {
    if (!token || !user?.isProfessional) return;
    apiClient
      .receivedReviews(token)
      .then(setReviews)
      .catch((err) => setError(err instanceof Error ? err.message : "Errore nel caricamento."));
  }, [token, user?.isProfessional]);

  // Dal link dell'avviso (#recensione-<id>): la lista arriva dopo il primo disegno, quindi si scorre a mano.
  useEffect(() => {
    if (!reviews || typeof window === "undefined" || !window.location.hash) return;
    document.getElementById(window.location.hash.slice(1))?.scrollIntoView({ block: "start" });
  }, [reviews]);

  if (isLoading) return null;

  if (!user || !token) {
    return (
      <YStack width="100%" alignItems="center" backgroundColor="transparent" paddingVertical="$9" paddingHorizontal="$4">
        <YStack width="100%" maxWidth={480} gap="$4" alignItems="center">
          <Text fontFamily="$heading" fontWeight="800" fontSize="$7" color={brand.grafite} textAlign="center">
            Accedi come professionista
          </Text>
          <Link href="/accedi?redirect=/dashboard/recensioni" style={{ textDecoration: "none" }}>
            <Button tabIndex={-1} variant="primary">Accedi</Button>
          </Link>
        </YStack>
      </YStack>
    );
  }

  if (!user.isProfessional) {
    return (
      <YStack width="100%" alignItems="center" backgroundColor="transparent" paddingVertical="$9" paddingHorizontal="$4">
        <Text fontFamily="$heading" fontWeight="800" fontSize="$7" color={brand.grafite} textAlign="center">
          Questa sezione è per i professionisti
        </Text>
      </YStack>
    );
  }

  const visible = reviews?.filter((review) => !review.hidden) ?? [];
  const average = visible.length > 0 ? visible.reduce((sum, review) => sum + review.rating, 0) / visible.length : null;
  const unanswered = reviews?.filter((review) => !review.professionalReply && !review.hidden).length ?? 0;
  const shown = onlyUnanswered ? (reviews ?? []).filter((review) => !review.professionalReply && !review.hidden) : (reviews ?? []);

  return (
    <YStack width="100%" alignItems="center" paddingVertical="$8" paddingHorizontal="$4">
      <YStack width="100%" maxWidth={880} gap="$5">
        <YStack gap="$1">
          <Text tag="h1" margin={0} fontFamily="$heading" fontWeight="800" fontSize={30} color={brand.grafite}>
            Recensioni
          </Text>
          <Text fontSize={16} color={brand.grafite70}>
            Rispondi con calma e cortesia: la tua risposta compare sotto la recensione e la leggono i prossimi clienti.
          </Text>
        </YStack>

        {error ? <Text color={brand.urgenza}>{error}</Text> : null}
        {reviews === null && !error ? <Text color={brand.grafite70}>Caricamento...</Text> : null}

        {reviews && reviews.length === 0 ? (
          <EmptyState
            icon="star"
            title="Nessuna recensione ancora"
            description="Le recensioni arrivano dai clienti dopo un lavoro confermato. A fine lavoro ricorda al cliente di lasciarne una."
          />
        ) : null}

        {reviews && reviews.length > 0 ? (
          <>
            <XStack gap="$4" flexWrap="wrap" alignItems="center">
              {average !== null ? (
                <XStack alignItems="center" gap="$2">
                  <Icon name="star" size={20} strokeWidth={1.5} color={brand.ottone} fill={brand.ottone} />
                  <Text fontWeight="800" fontSize={22} color={brand.grafite}>
                    {average.toFixed(1).replace(".", ",")}
                  </Text>
                  <Text fontSize={16} color={brand.grafite70}>
                    su {visible.length} recension{visible.length === 1 ? "e" : "i"}
                  </Text>
                </XStack>
              ) : null}
              <XStack gap="$2" flexWrap="wrap">
                <Chip selected={!onlyUnanswered} onPress={() => setOnlyUnanswered(false)}>
                  Tutte
                </Chip>
                <Chip selected={onlyUnanswered} onPress={() => setOnlyUnanswered(true)}>
                  {`Da rispondere${unanswered > 0 ? ` (${unanswered})` : ""}`}
                </Chip>
              </XStack>
            </XStack>

            {shown.length === 0 ? <Text color={brand.grafite70}>Hai risposto a tutte le recensioni.</Text> : null}

            <YStack gap="$3">
              {shown.map((review) => (
                <Surface key={review.id} gap="$2">
                  {/* Ancora per il link dell'avviso "Nuova recensione": un <div> grezzo, come sul profilo pubblico. */}
                  <div id={`recensione-${review.id}`} style={{ scrollMarginTop: 96 }} />
                  <XStack alignItems="center" justifyContent="space-between" gap="$2" flexWrap="wrap">
                    <XStack alignItems="center" gap="$2" flexWrap="wrap">
                      <Stars rating={review.rating} />
                      <Text fontWeight="700" color={brand.grafite}>
                        {review.clientName}
                      </Text>
                      {review.jobLabel ? (
                        <Text fontSize={13} color={brand.grafite70}>
                          {review.jobLabel}
                        </Text>
                      ) : null}
                    </XStack>
                    <Text fontSize={13} color={brand.grafite70}>
                      {formatDate(review.createdAt)}
                    </Text>
                  </XStack>
                  {review.comment ? <Text color={brand.grafite70}>{review.comment}</Text> : null}
                  {review.photoUrls.length > 0 ? (
                    <XStack gap="$2" flexWrap="wrap">
                      {review.photoUrls.map((url) => (
                        <YStack key={url} width={72} height={72} borderRadius="$2" overflow="hidden" borderWidth={1} borderColor={brand.filetto}>
                          <MediaPreview url={url} />
                        </YStack>
                      ))}
                    </XStack>
                  ) : null}
                  {review.updatedAfterIssueAt ? (
                    <Text fontSize={13} color={brand.grafite70}>
                      Aggiornata il {formatDate(review.updatedAfterIssueAt)} dopo una segnalazione a lavoro chiuso
                    </Text>
                  ) : null}
                  {review.hidden ? (
                    <Text fontSize={13} color={brand.urgenza}>
                      Nascosta dal nostro team dopo una segnalazione: non la vede nessun altro e non conta nella media.
                    </Text>
                  ) : (
                    <ReviewReply
                      reviewId={review.id}
                      businessName=""
                      title="La tua risposta"
                      reply={review.professionalReply}
                      canEdit
                      token={token}
                      onSaved={(reply) =>
                        setReviews((current) => current?.map((item) => (item.id === review.id ? { ...item, professionalReply: reply } : item)) ?? current)
                      }
                    />
                  )}
                  {review.guidedRequestId ? (
                    <Link href={`/dashboard/richieste?open=${review.guidedRequestId}`} style={{ fontSize: 13, fontWeight: 700, alignSelf: "flex-start" }}>
                      Apri il lavoro
                    </Link>
                  ) : null}
                </Surface>
              ))}
            </YStack>
          </>
        ) : null}
      </YStack>
    </YStack>
  );
}
