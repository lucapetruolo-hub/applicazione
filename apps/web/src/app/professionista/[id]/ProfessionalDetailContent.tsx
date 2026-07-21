"use client";

import Link from "next/link";
import type { ProfessionalDetail } from "@professionisti/shared";
import { Button, H1, H2, Paragraph, Text, XStack, YStack } from "@professionisti/ui";
import { CategoryIconBadge } from "@/components/CategoryIconBadge";

export function ProfessionalDetailContent({ professional }: { professional: ProfessionalDetail }) {
  return (
    <YStack width="100%" alignItems="center">
      <YStack width="100%" maxWidth={780} paddingHorizontal="$4" paddingVertical="$6" gap="$5">
        <XStack gap="$3" alignItems="flex-start">
          <CategoryIconBadge slug={professional.categorySlug} size={64} />
          <YStack gap="$2" flex={1}>
            <XStack alignItems="center" gap="$3" flexWrap="wrap">
              <H1 size="$8">{professional.businessName}</H1>
              {professional.verified ? (
                <Text fontSize="$3" color="$blue10" fontWeight="600">
                  ✓ Verificato
                </Text>
              ) : null}
              {professional.boosted ? (
                <Text fontSize="$2" backgroundColor="$yellow4" color="$yellow11" paddingHorizontal="$2" paddingVertical="$1" borderRadius="$4">
                  In evidenza
                </Text>
              ) : null}
            </XStack>
            <Text fontSize="$5" color="$color10">
              {professional.categoryLabel} · {professional.city}
            </Text>
            {professional.rating !== null ? (
              <Text fontSize="$5">
                ⭐ {professional.rating.toFixed(1)} · {professional.reviewCount} recension{professional.reviewCount === 1 ? "e" : "i"}
              </Text>
            ) : (
              <Text fontSize="$4" color="$color9">
                Nessuna recensione ancora
              </Text>
            )}
          </YStack>
        </XStack>

        {professional.subTags.length > 0 ? (
          <XStack flexWrap="wrap" gap="$2">
            {professional.subTags.map((tag) => (
              <YStack key={tag} paddingHorizontal="$3" paddingVertical="$2" backgroundColor="$color3" borderRadius="$10">
                <Text fontSize="$2">{tag.replace(/-/g, " ")}</Text>
              </YStack>
            ))}
          </XStack>
        ) : null}

        {professional.bio ? <Paragraph color="$color10">{professional.bio}</Paragraph> : null}

        <Link
          href={`/preventivo?categoria=${professional.categorySlug}&professionista=${professional.id}`}
          style={{ textDecoration: "none", alignSelf: "flex-start" }}
        >
          <Button size="$5">{`Richiedi un preventivo a ${professional.businessName}`}</Button>
        </Link>

        <YStack gap="$3">
          <H2 size="$6">Recensioni</H2>
          {professional.reviews.length === 0 ? (
            <Text color="$color9">Questo professionista non ha ancora recensioni.</Text>
          ) : (
            professional.reviews.map((review) => (
              <YStack key={review.id} padding="$3" backgroundColor="$color2" borderRadius="$4" gap="$1">
                <Text fontWeight="600">⭐ {review.rating}/5</Text>
                {review.comment ? <Text color="$color10">{review.comment}</Text> : null}
              </YStack>
            ))
          )}
        </YStack>
      </YStack>
    </YStack>
  );
}
