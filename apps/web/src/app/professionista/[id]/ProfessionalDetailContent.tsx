"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatServicePriceRange, type ProfessionalAgendaDay, type ProfessionalDetail } from "@professionisti/shared";
import { Button, H1, H2, Paragraph, Text, XStack, YStack } from "@professionisti/ui";
import { ProfessionalAvatar } from "@/components/ProfessionalAvatar";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/lib/AuthContext";

export function ProfessionalDetailContent({ professional }: { professional: ProfessionalDetail }) {
  const { user, token } = useAuth();
  const [isSaved, setIsSaved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [agenda, setAgenda] = useState<ProfessionalAgendaDay[] | null>(null);

  useEffect(() => {
    if (!token || user?.role !== "CLIENT") return;
    apiClient
      .mySavedProfessionals(token)
      .then((saved) => setIsSaved(saved.some((p) => p.id === professional.id)))
      .catch(() => {});
  }, [token, user, professional.id]);

  useEffect(() => {
    apiClient
      .getProfessionalAgenda(professional.id)
      .then(setAgenda)
      .catch(() => {});
  }, [professional.id]);

  async function handleToggleSave() {
    if (!token) return;
    setIsSaving(true);
    try {
      if (isSaved) {
        await apiClient.unsaveProfessional(token, professional.id);
        setIsSaved(false);
      } else {
        await apiClient.saveProfessional(token, professional.id);
        setIsSaved(true);
      }
    } catch {
      // silenzioso: non è un'azione critica, l'utente può riprovare
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <YStack width="100%" alignItems="center">
      <YStack width="100%" maxWidth={780} paddingHorizontal="$4" paddingVertical="$6" gap="$5">
        <XStack gap="$3" alignItems="flex-start" justifyContent="space-between">
          <XStack gap="$3" alignItems="flex-start" flex={1}>
            <ProfessionalAvatar imageUrl={professional.imageUrl} categorySlug={professional.categorySlug} size={64} />
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
              {professional.address ? (
                <Text fontSize="$4" color="$color10">
                  📍 {professional.address}
                </Text>
              ) : null}
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

          {user?.role === "CLIENT" ? (
            <Button
              size="$3"
              backgroundColor={isSaved ? "$red2" : "$color3"}
              color={isSaved ? "$red10" : "$color12"}
              onPress={handleToggleSave}
              disabled={isSaving}
              opacity={isSaving ? 0.6 : 1}
            >
              {isSaved ? "♥ Salvato" : "♡ Salva"}
            </Button>
          ) : null}
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

        {professional.services.length > 0 ? (
          <YStack gap="$2">
            <H2 size="$6">Prestazioni</H2>
            <YStack borderWidth={1} borderColor="$borderColor" borderRadius="$4" overflow="hidden">
              {professional.services.map((service, index) => (
                <XStack
                  key={service.id}
                  justifyContent="space-between"
                  alignItems="center"
                  paddingHorizontal="$3"
                  paddingVertical="$3"
                  backgroundColor={index % 2 === 0 ? "transparent" : "$color2"}
                >
                  <Text>{service.name}</Text>
                  <Text fontWeight="600">
                    {formatServicePriceRange(service.priceMinEurCents, service.priceMaxEurCents)}
                  </Text>
                </XStack>
              ))}
            </YStack>
          </YStack>
        ) : null}

        {agenda && agenda.some((day) => day.slots.length > 0) ? (
          <YStack gap="$2">
            <H2 size="$6">Agenda</H2>
            <Paragraph color="$color9" fontSize="$2">
              Orari disponibili nei prossimi giorni. Le fasce barrate sono già prenotate.
            </Paragraph>
            <YStack gap="$2">
              {agenda
                .filter((day) => day.slots.length > 0)
                .map((day) => (
                  <XStack key={day.date} gap="$3" alignItems="flex-start" flexWrap="wrap">
                    <Text fontWeight="600" width={110} flexShrink={0}>
                      {/* Data UTC (vedi getPublicAgenda lato API): formattata così com'è, senza conversione di
                          fuso — coerente con come scheduledAt viene già trattato nel resto del progetto. */}
                      {new Date(`${day.date}T00:00:00Z`).toLocaleDateString("it-IT", {
                        weekday: "short",
                        day: "numeric",
                        month: "short",
                        timeZone: "UTC",
                      })}
                    </Text>
                    <XStack gap="$2" flexWrap="wrap" flex={1}>
                      {day.slots.map((slot) => (
                        <YStack
                          key={`${slot.startTime}-${slot.endTime}`}
                          paddingHorizontal="$2"
                          paddingVertical="$1"
                          borderRadius="$3"
                          backgroundColor={slot.booked ? "$color3" : "$green3"}
                        >
                          <Text
                            fontSize="$2"
                            color={slot.booked ? "$color9" : "$green11"}
                            textDecorationLine={slot.booked ? "line-through" : "none"}
                          >
                            {slot.startTime}–{slot.endTime}
                          </Text>
                        </YStack>
                      ))}
                    </XStack>
                  </XStack>
                ))}
            </YStack>
          </YStack>
        ) : null}

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
              <YStack key={review.id} padding="$3" backgroundColor="$color2" borderRadius="$4" gap="$2">
                <Text fontWeight="600">⭐ {review.rating}/5</Text>
                {review.comment ? <Text color="$color10">{review.comment}</Text> : null}
                {review.photoUrls.length > 0 ? (
                  <XStack gap="$2" flexWrap="wrap">
                    {review.photoUrls.map((url) => (
                      <YStack key={url} width={72} height={72} borderRadius="$3" overflow="hidden" borderWidth={1} borderColor="$borderColor">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                      </YStack>
                    ))}
                  </XStack>
                ) : null}
              </YStack>
            ))
          )}
        </YStack>
      </YStack>
    </YStack>
  );
}
