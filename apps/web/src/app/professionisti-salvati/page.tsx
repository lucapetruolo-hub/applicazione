"use client";

import { professionalPath, subTagLabel } from "@professionisti/shared";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ProfessionalSearchResult } from "@professionisti/shared";
import { Button, EmptyState, Icon, ProfessionalCard, Text, XStack, YStack, brand } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/lib/AuthContext";
import { IconActionButton } from "@/components/IconActionButton";
import { CARD_PHOTO, ProfessionalAvatar } from "@/components/ProfessionalAvatar";
import { SkeletonProfessionalCard } from "@/components/Skeleton";
import { EmptySavedIllustration } from "@/components/icons/EmptyStateIllustrations";

export default function ProfessionistiSalvatiPage() {
  const router = useRouter();
  const { user, token, isLoading } = useAuth();
  const [professionals, setProfessionals] = useState<ProfessionalSearchResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Tolti dai salvati in questa visita: la scheda resta con il cuore vuoto,
  // così un tocco per sbaglio si annulla con un altro tocco (stesso controllo
  // della ricerca, docs/CHANGELOG.md §349). Alla prossima visita non c'è più.
  const [unsavedIds, setUnsavedIds] = useState<Set<string>>(() => new Set());
  const [pendingId, setPendingId] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    apiClient
      .mySavedProfessionals(token)
      .then(setProfessionals)
      .catch((err) => setError(err instanceof Error ? err.message : "Errore nel caricamento."));
  }, [token]);

  async function handleToggle(professionalProfileId: string) {
    if (!token) return;
    const wasSaved = !unsavedIds.has(professionalProfileId);
    setPendingId(professionalProfileId);
    try {
      if (wasSaved) await apiClient.unsaveProfessional(token, professionalProfileId);
      else await apiClient.saveProfessional(token, professionalProfileId);
      setUnsavedIds((prev) => {
        const next = new Set(prev);
        if (wasSaved) next.add(professionalProfileId);
        else next.delete(professionalProfileId);
        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore imprevisto, riprova.");
    } finally {
      setPendingId(null);
    }
  }

  if (isLoading) return null;

  if (!user || !token) {
    return (
      <YStack width="100%" alignItems="center" backgroundColor="transparent" paddingVertical="$9" paddingHorizontal="$4">
        <YStack width="100%" maxWidth={480} gap="$4" alignItems="center">
          <Text fontFamily="$heading" fontWeight="800" fontSize="$7" color={brand.grafite} textAlign="center">
            Accedi per vedere i tuoi professionisti salvati
          </Text>
          <Link href="/accedi?redirect=/professionisti-salvati" style={{ textDecoration: "none" }}>
            <Button variant="primary">Accedi</Button>
          </Link>
        </YStack>
      </YStack>
    );
  }

  return (
    <YStack width="100%" alignItems="center" backgroundColor="transparent" paddingVertical="$8" paddingHorizontal="$4">
      <XStack width="100%" maxWidth={880} gap="$8" alignItems="flex-start" flexWrap="wrap">
        <YStack flex={1} minWidth={280} gap="$5">
          <Text fontFamily="$heading" fontWeight="800" fontSize="$8" color={brand.grafite}>
            Professionisti salvati
          </Text>

          {error ? <Text color={brand.urgenza}>{error}</Text> : null}

          {professionals === null ? (
            <YStack gap="$3">
              <SkeletonProfessionalCard />
              <SkeletonProfessionalCard />
              <SkeletonProfessionalCard />
            </YStack>
          ) : professionals.length === 0 ? (
            <EmptyState
              icon="heart"
              illustration={<EmptySavedIllustration size={28} style={{ color: brand.cianografiaScuro }} />}
              title="Nessun professionista salvato"
              description='Apri il profilo di un professionista e tocca "Salva" per ritrovarlo qui.'
              action={
                <Link href="/" style={{ textDecoration: "none" }}>
                  <Text color={brand.cianografiaScuro} fontWeight="600">
                    Cerca professionisti
                  </Text>
                </Link>
              }
            />
          ) : (
            <YStack gap="$3">
              {professionals.map((pro, index) => {
                const saved = !unsavedIds.has(pro.id);
                return (
                  <ProfessionalCard
                    key={pro.id}
                    defaultExpanded={index === 0}
                    businessName={pro.businessName}
                    categoryLabel={pro.categoryLabel}
                    otherCategoryLabels={pro.categories?.filter((category) => category.slug !== pro.categorySlug).map((category) => category.label)}
                    city={pro.city}
                    subTags={pro.subTags.map(subTagLabel)}
                    rating={pro.rating ?? undefined}
                    reviewCount={pro.reviewCount}
                    completedThisMonth={pro.completedThisMonth}
                    verified={pro.verified}
                    stripeVerified={pro.stripeVerified}
                    professionalKind={pro.professionalKind}
                    hasLiabilityInsurance={pro.hasLiabilityInsurance}
                    boosted={pro.boosted}
                    isNewProfile={pro.isNewProfile}
                    services={pro.services}
                    href={professionalPath(pro)}
                    onPress={() => router.push(professionalPath(pro))}
                    icon={
                      <ProfessionalAvatar
                        imageUrl={pro.imageUrl}
                        categorySlug={pro.categorySlug}
                        size={CARD_PHOTO.size}
                        mobileSize={CARD_PHOTO.mobileSize}
                        shape={CARD_PHOTO.shape}
                      />
                    }
                    // Cuore pieno in alto a destra, come nella ricerca (docs/CHANGELOG.md
                    // §349): prima "Rimuovi dai salvati" era un testo piccolo fuori dalla scheda.
                    action={
                      // Il clic sul cuore non deve aprire anche il profilo (clic sulla card).
                      // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
                      <span style={{ display: "inline-flex", flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
                        <IconActionButton
                          label={saved ? "Salvato" : "Salva"}
                          active={saved}
                          disabled={pendingId === pro.id}
                          size={36}
                          celebrate
                          onPress={() => void handleToggle(pro.id)}
                        >
                          <Icon name="heart" size={16} strokeWidth={2} color={saved ? "white" : brand.grafite} fill={saved ? "white" : "none"} />
                        </IconActionButton>
                      </span>
                    }
                  />
                );
              })}
            </YStack>
          )}
        </YStack>
      </XStack>
    </YStack>
  );
}
