"use client";

import { useEffect, useState } from "react";
import { Icon, Rating, Section, Surface, Text, XStack, YStack, brand } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";

type RecentReview = {
  id: string;
  rating: number;
  comment: string | null;
  isAutomatic: boolean;
  createdAt: string;
  professional: { businessName: string; categoryLabel: string; city: string };
};

/**
 * Riprova sociale reale in home (audit, punto J): le ultime recensioni
 * pubbliche della piattaforma, dallo stesso criterio "doppio cieco" della
 * pagina profilo (GET /reviews/recent). Mai una recensione inventata: se
 * non ce ne sono ancora, la sezione non viene proprio renderizzata — lo
 * stesso principio "niente dati finti" seguito per prezzi e vetrina.
 */
export function RecentReviews() {
  const [reviews, setReviews] = useState<RecentReview[] | null>(null);

  useEffect(() => {
    apiClient
      .getRecentReviews()
      .then(setReviews)
      .catch(() => setReviews([]));
  }, []);

  if (!reviews || reviews.length === 0) return null;

  return (
    <Section eyebrow="Recensioni verificate" title="Chi ha già trovato il professionista giusto" maxWidth={1080}>
      <XStack flexWrap="wrap" gap="$4" width="100%" justifyContent="center">
        {reviews.map((review) => (
          <Surface key={review.id} width={320} flexGrow={1} flexBasis={280} maxWidth={360} padding="$5" gap="$3">
            <XStack alignItems="center" justifyContent="space-between" gap="$2">
              <Rating value={review.rating} size={14} />
              <XStack alignItems="center" gap="$1">
                <Icon name="badge-check" size={13} color={brand.verificato} strokeWidth={2} />
                <Text fontFamily="$body" fontSize={11} fontWeight="700" color={brand.verificato}>
                  Lavoro confermato
                </Text>
              </XStack>
            </XStack>
            <Text fontSize={14} lineHeight={21} color={brand.grafite} fontStyle="italic">
              {review.isAutomatic ? "(recensione automatica)" : `“${review.comment ?? ""}”`}
            </Text>
            <YStack gap={2} borderTopWidth={1} borderTopColor={brand.filetto} paddingTop="$2">
              <Text fontSize={13} fontWeight="700" color={brand.grafite}>
                {review.professional.businessName}
              </Text>
              <Text fontSize={12} color={brand.grafite70}>
                {review.professional.categoryLabel} · {review.professional.city}
              </Text>
            </YStack>
          </Surface>
        ))}
      </XStack>
    </Section>
  );
}
