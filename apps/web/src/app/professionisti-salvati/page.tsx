"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ProfessionalSearchResult } from "@professionisti/shared";
import { Button, H1, Paragraph, ProfessionalCard, Text, YStack } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/lib/AuthContext";
import { ProfessionalAvatar } from "@/components/ProfessionalAvatar";

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
      <YStack width="100%" alignItems="center" paddingVertical="$9" paddingHorizontal="$4">
        <YStack width="100%" maxWidth={480} gap="$4" alignItems="center">
          <H1 size="$7" textAlign="center">
            Accedi per vedere i tuoi professionisti salvati
          </H1>
          <Link href="/accedi?redirect=/professionisti-salvati" style={{ textDecoration: "none" }}>
            <Button size="$5">Accedi</Button>
          </Link>
        </YStack>
      </YStack>
    );
  }

  return (
    <YStack width="100%" alignItems="center" paddingVertical="$8" paddingHorizontal="$4">
      <YStack width="100%" maxWidth={720} gap="$5">
        <H1 size="$8">Professionisti salvati</H1>

        {error ? <Text color="$red10">{error}</Text> : null}

        {professionals === null ? (
          <Text color="$color9">Caricamento...</Text>
        ) : professionals.length === 0 ? (
          <YStack gap="$3">
            <Paragraph color="$color10">
              Non hai ancora salvato nessun professionista. Apri il profilo di un professionista e tocca &quot;Salva&quot;
              per ritrovarlo qui.
            </Paragraph>
            <Link href="/" style={{ textDecoration: "none" }}>
              <Text color="$blue10" fontWeight="600">
                Cerca professionisti
              </Text>
            </Link>
          </YStack>
        ) : (
          <YStack gap="$3">
            {professionals.map((pro) => (
              <YStack key={pro.id} gap="$2">
                <ProfessionalCard
                  businessName={pro.businessName}
                  categoryLabel={pro.categoryLabel}
                  city={pro.city}
                  rating={pro.rating ?? undefined}
                  verified={pro.verified}
                  onPress={() => router.push(`/professionista/${pro.id}`)}
                  icon={<ProfessionalAvatar imageUrl={pro.imageUrl} categorySlug={pro.categorySlug} size={44} />}
                />
                <Button size="$2" alignSelf="flex-end" backgroundColor="$color3" color="$color12" onPress={() => handleRemove(pro.id)}>
                  Rimuovi dai salvati
                </Button>
              </YStack>
            ))}
          </YStack>
        )}
      </YStack>
    </YStack>
  );
}
