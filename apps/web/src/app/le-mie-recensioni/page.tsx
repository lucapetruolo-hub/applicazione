"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { SentReview } from "@professionisti/api-client";
import { Button, EmptyState, Icon, Surface, Text, XStack, YStack, brand } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/lib/AuthContext";
import { MediaPreview } from "@/components/MediaPreview";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" });
}

function Stars({ rating }: { rating: number }) {
  return (
    <XStack gap={2}>
      {[1, 2, 3, 4, 5].map((value) => (
        <Icon
          key={value}
          name="star"
          size={15}
          strokeWidth={1.5}
          color={brand.ottone}
          fill={value <= rating ? brand.ottone : "none"}
        />
      ))}
    </XStack>
  );
}

function MediaRow({ urls }: { urls: string[] }) {
  if (urls.length === 0) return null;
  return (
    <XStack gap="$2" flexWrap="wrap">
      {urls.map((url) => (
        <YStack key={url} width={72} height={72} borderRadius="$2" overflow="hidden" borderWidth={1} borderColor={brand.filetto}>
          <MediaPreview url={url} />
        </YStack>
      ))}
    </XStack>
  );
}

/**
 * Scheda "Recensioni" del cliente: le recensioni che ha scritto ai
 * professionisti (docs/CHANGELOG.md §180). La sottoscheda "Ricevute" non
 * esiste più: il professionista non recensisce più il cliente (§215).
 */
export default function LeMieRecensioniPage() {
  const { user, token, isLoading } = useAuth();
  const [sent, setSent] = useState<SentReview[] | null>(null);
  const [sentError, setSentError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    apiClient
      .mySentReviews(token)
      .then(setSent)
      .catch((err) => setSentError(err instanceof Error ? err.message : "Errore nel caricamento."));
  }, [token]);

  if (isLoading) return null;

  if (!user || !token) {
    return (
      <YStack width="100%" alignItems="center" backgroundColor="transparent" paddingVertical="$9" paddingHorizontal="$4">
        <YStack width="100%" maxWidth={480} gap="$4" alignItems="center">
          <Text fontFamily="$heading" fontWeight="800" fontSize="$7" color={brand.grafite} textAlign="center">
            Accedi per vedere le tue recensioni
          </Text>
          <Link href="/accedi?redirect=/le-mie-recensioni" style={{ textDecoration: "none" }}>
            <Button variant="primary">Accedi</Button>
          </Link>
        </YStack>
      </YStack>
    );
  }

  return (
    <YStack width="100%" alignItems="center" backgroundColor="transparent" paddingVertical="$8" paddingHorizontal="$4">
      <YStack width="100%" maxWidth={760} gap="$5">
        <YStack gap="$1">
          <Text fontFamily="$heading" fontWeight="800" fontSize="$8" color={brand.grafite}>
            Recensioni
          </Text>
          <Text color={brand.grafite70}>Le recensioni che hai lasciato ai professionisti dopo un lavoro concluso.</Text>
        </YStack>

        <SentReviewsList reviews={sent} error={sentError} />
      </YStack>
    </YStack>
  );
}

function SentReviewsList({ reviews, error }: { reviews: SentReview[] | null; error: string | null }) {
  if (error) return <Text color={brand.urgenza}>{error}</Text>;
  if (reviews === null) return <Text color={brand.grafite70}>Caricamento...</Text>;
  if (reviews.length === 0) {
    return (
      <EmptyState
        icon="star"
        title="Nessuna recensione inviata"
        description="Quando un lavoro è concluso puoi recensire il professionista dalla scheda della richiesta in Le mie richieste."
      />
    );
  }
  return (
    <YStack gap="$3">
      {reviews.map((review) => (
        <Surface key={review.id} gap="$2">
          <XStack alignItems="center" justifyContent="space-between" gap="$2" flexWrap="wrap">
            <XStack alignItems="center" gap="$2" flexWrap="wrap">
              <Stars rating={review.rating} />
              {review.professionalProfileId ? (
                <Link href={`/professionista/${review.professionalProfileId}`} style={{ textDecoration: "none" }}>
                  <Text fontWeight="700" color={brand.cianografiaScuro}>
                    {review.businessName}
                  </Text>
                </Link>
              ) : (
                <Text fontWeight="700" color={brand.grafite}>
                  {review.businessName}
                </Text>
              )}
              {review.isAutomatic ? (
                <Text fontSize="$2" color={brand.grafite70} fontStyle="italic">
                  (recensione automatica)
                </Text>
              ) : null}
            </XStack>
            <Text fontSize="$2" color={brand.grafite70}>
              {formatDate(review.createdAt)}
            </Text>
          </XStack>
          {review.comment ? <Text color={brand.grafite70}>{review.comment}</Text> : null}
          <MediaRow urls={review.mediaUrls} />
          {review.hidden ? (
            <Text fontSize="$2" color={brand.urgenza}>
              Nascosta dopo una segnalazione: non compare sul profilo del professionista.
            </Text>
          ) : null}
        </Surface>
      ))}
    </YStack>
  );
}
