"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { ReceivedClientReview, SentReview } from "@professionisti/api-client";
import { Button, EmptyState, Icon, Rating, Surface, Text, XStack, YStack, brand } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/lib/AuthContext";
import { MediaPreview } from "@/components/MediaPreview";
import { ReportContentModal } from "@/components/ReportContentModal";
import { hasRecentlyReported, markReported } from "@/lib/reportedContent";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" });
}

type ReviewsTab = "ricevute" | "inviate";

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
 * Scheda "Recensioni" del cliente (decisioni dell'utente, docs/CHANGELOG.md
 * §179 e §182), con due sottoschede:
 * - "Ricevute": le recensioni che i professionisti gli hanno lasciato, le
 *   stesse che loro vedono nella scheda cliente (ClientProfileModal), con la
 *   media in alto. Solo quelle già sbloccate dal "doppio cieco".
 * - "Inviate": le recensioni che il cliente ha scritto ai professionisti,
 *   comprese quelle ancora in attesa del "doppio cieco".
 */
export default function LeMieRecensioniPage() {
  const { user, token, isLoading } = useAuth();
  const [tab, setTab] = useState<ReviewsTab>("ricevute");
  const [reviews, setReviews] = useState<ReceivedClientReview[] | null>(null);
  const [sent, setSent] = useState<SentReview[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sentError, setSentError] = useState<string | null>(null);
  const [reportTargetId, setReportTargetId] = useState<string | null>(null);
  const [reportedIds, setReportedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!token) return;
    apiClient
      .myReceivedClientReviews(token)
      .then((list) => {
        setReviews(list);
        setReportedIds(new Set(list.filter((r) => hasRecentlyReported("CLIENT_REVIEW", r.id)).map((r) => r.id)));
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Errore nel caricamento."));
    apiClient
      .mySentReviews(token)
      .then(setSent)
      .catch((err) => setSentError(err instanceof Error ? err.message : "Errore nel caricamento."));
  }, [token]);

  // La sottoscheda resta nell'indirizzo (?scheda=inviate), così un link la riapre.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("scheda") === "inviate") setTab("inviate");
  }, []);

  const selectTab = (next: ReviewsTab) => {
    setTab(next);
    const url = new URL(window.location.href);
    if (next === "inviate") url.searchParams.set("scheda", "inviate");
    else url.searchParams.delete("scheda");
    window.history.replaceState(null, "", url.toString());
  };

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

  const average = reviews && reviews.length > 0 ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length : null;

  return (
    <YStack width="100%" alignItems="center" backgroundColor="transparent" paddingVertical="$8" paddingHorizontal="$4">
      <YStack width="100%" maxWidth={760} gap="$5">
        <YStack gap="$1">
          <Text fontFamily="$heading" fontWeight="800" fontSize="$8" color={brand.grafite}>
            Recensioni
          </Text>
          <Text color={brand.grafite70}>
            {tab === "ricevute"
              ? "Cosa scrivono di te i professionisti con cui hai lavorato. Le vedono anche i professionisti a cui mandi una richiesta."
              : "Le recensioni che hai lasciato ai professionisti dopo un lavoro concluso."}
          </Text>
        </YStack>

        <XStack gap="$2" flexWrap="wrap" role="tablist">
          {(
            [
              { key: "ricevute", label: "Ricevute", count: reviews?.length },
              { key: "inviate", label: "Inviate", count: sent?.length },
            ] as const
          ).map((item) => {
            const active = tab === item.key;
            return (
              <XStack
                key={item.key}
                alignItems="center"
                gap="$2"
                paddingHorizontal="$3"
                paddingVertical={9}
                borderRadius={999}
                backgroundColor={active ? brand.cianografia : brand.calce}
                borderWidth={1}
                borderColor={active ? brand.cianografia : brand.filetto}
                cursor="pointer"
                onPress={() => selectTab(item.key)}
                accessibilityRole="tab"
                aria-selected={active}
              >
                <Text fontFamily="$body" fontSize={13.5} fontWeight="800" color={active ? "white" : brand.grafite}>
                  {item.label}
                  {item.count !== undefined ? ` (${item.count})` : ""}
                </Text>
              </XStack>
            );
          })}
        </XStack>

        {tab === "inviate" ? (
          <SentReviewsList reviews={sent} error={sentError} />
        ) : error ? (
          <Text color={brand.urgenza}>{error}</Text>
        ) : reviews === null ? (
          <Text color={brand.grafite70}>Caricamento...</Text>
        ) : reviews && reviews.length === 0 ? (
          <EmptyState
            icon="star"
            title="Nessuna recensione per ora"
            description="Dopo un lavoro concluso il professionista può lasciarti una recensione. La vedi qui quando avrai recensito anche tu, oppure dopo 3 giorni."
          />
        ) : reviews ? (
          <>
            {average !== null ? (
              <Surface gap="$2">
                <Text fontFamily="$body" fontWeight="700" fontSize={11} color={brand.grafite70}>
                  LA TUA MEDIA
                </Text>
                <XStack alignItems="center" gap="$3" flexWrap="wrap">
                  <Text fontFamily="$heading" fontWeight="800" fontSize="$9" color={brand.grafite}>
                    {average.toFixed(1)}
                  </Text>
                  <Rating value={average} count={reviews.length} size={18} />
                </XStack>
              </Surface>
            ) : null}

            <YStack gap="$3">
              {reviews.map((review) => {
                const reported = reportedIds.has(review.id);
                return (
                  <Surface key={review.id} gap="$2">
                    <XStack alignItems="center" justifyContent="space-between" gap="$2" flexWrap="wrap">
                      <XStack alignItems="center" gap="$2" flexWrap="wrap">
                        <Stars rating={review.rating} />
                        <Text fontWeight="700" color={brand.grafite}>
                          {review.reviewerBusinessName}
                        </Text>
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
                    <XStack
                      alignItems="center"
                      gap={4}
                      alignSelf="flex-start"
                      cursor={reported ? "default" : "pointer"}
                      opacity={reported ? 0.5 : 1}
                      onPress={reported ? undefined : () => setReportTargetId(review.id)}
                      accessibilityRole="button"
                    >
                      <Icon name="flag" size={12} strokeWidth={1.5} color={brand.grafite70} />
                      <Text fontSize="$2" color={brand.grafite70}>
                        {reported ? "Già segnalata" : "Segnala"}
                      </Text>
                    </XStack>
                  </Surface>
                );
              })}
            </YStack>
          </>
        ) : null}
      </YStack>

      {reportTargetId ? (
        <ReportContentModal
          targetType="CLIENT_REVIEW"
          targetLabel="questa recensione"
          onClose={() => setReportTargetId(null)}
          onSubmit={async (reason, details) => {
            await apiClient.createContentReport(token, { targetType: "CLIENT_REVIEW", targetId: reportTargetId, reason, details });
            markReported("CLIENT_REVIEW", reportTargetId);
            setReportedIds((prev) => new Set(prev).add(reportTargetId));
          }}
        />
      ) : null}
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
          ) : !review.isPublic ? (
            <Text fontSize="$2" color={brand.grafite70}>
              In attesa: diventa visibile sul profilo quando anche il professionista segna il lavoro come terminato e ti recensisce, o 3 giorni dopo.
            </Text>
          ) : null}
        </Surface>
      ))}
    </YStack>
  );
}
