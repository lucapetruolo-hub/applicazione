"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ProfessionalSearchResult } from "@professionisti/shared";
import { Button, EmptyState, ProfessionalCard, Text, XStack, YStack, brand } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/lib/AuthContext";
import { ProfessionalAvatar } from "@/components/ProfessionalAvatar";
import { AccountSidebar } from "@/components/AccountSidebar";
import { LoadingState } from "@/components/LoadingState";

export default function ProfessionistiSalvatiPage() {
  const router = useRouter();
  const { user, token, isLoading } = useAuth();
  const [professionals, setProfessionals] = useState<ProfessionalSearchResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    apiClient
      .mySavedProfessionals(token)
      .then(setProfessionals)
      .catch((err) => setError(err instanceof Error ? err.message : "Errore nel caricamento."));
  }, [token]);

  async function handleRemove(professionalProfileId: string) {
    if (!token) return;
    try {
      await apiClient.unsaveProfessional(token, professionalProfileId);
      setProfessionals((prev) => (prev ? prev.filter((p) => p.id !== professionalProfileId) : prev));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore imprevisto, riprova.");
    }
  }

  if (isLoading) return null;

  if (!user || !token) {
    return (
      <YStack width="100%" alignItems="center" backgroundColor={brand.gesso} paddingVertical="$9" paddingHorizontal="$4">
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
    <YStack width="100%" alignItems="center" backgroundColor={brand.gesso} paddingVertical="$8" paddingHorizontal="$4">
      <XStack width="100%" maxWidth={900} gap="$8" alignItems="flex-start" flexWrap="wrap">
        <AccountSidebar />

        <YStack flex={1} minWidth={280} gap="$5">
          <Text fontFamily="$heading" fontWeight="800" fontSize="$8" color={brand.grafite}>
            Professionisti salvati
          </Text>

          {error ? <Text color={brand.urgenza}>{error}</Text> : null}

          {professionals === null ? (
            <LoadingState />
          ) : professionals.length === 0 ? (
            <EmptyState
              icon="heart"
              title="Nessun professionista salvato"
              description='Apri il profilo di un professionista e tocca "Salva" per ritrovarlo qui.'
              action={
                <Link href="/" style={{ textDecoration: "none" }}>
                  <Text color={brand.cianografia} fontWeight="600">
                    Cerca professionisti
                  </Text>
                </Link>
              }
            />
          ) : (
            <YStack gap="$3">
              {professionals.map((pro) => (
                <YStack key={pro.id} gap="$2">
                  <ProfessionalCard
                    businessName={pro.businessName}
                    categoryLabel={pro.categoryLabel}
                    city={pro.city}
                    subTags={pro.subTags}
                    rating={pro.rating ?? undefined}
                    reviewCount={pro.reviewCount}
                    verified={pro.verified}
                    services={pro.services}
                    onPress={() => router.push(`/professionista/${pro.id}`)}
                    icon={<ProfessionalAvatar imageUrl={pro.imageUrl} categorySlug={pro.categorySlug} size={72} />}
                  />
                  <Button variant="ghost" size="$2" height={36} alignSelf="flex-end" onPress={() => handleRemove(pro.id)}>
                    Rimuovi dai salvati
                  </Button>
                </YStack>
              ))}
            </YStack>
          )}
        </YStack>
      </XStack>
    </YStack>
  );
}
