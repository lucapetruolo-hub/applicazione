"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { RevenueAnalyticsSummary } from "@professionisti/api-client";
import { Button, Icon, Text, XStack, YStack, brand } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/lib/AuthContext";
import { SkeletonRevenuePanel } from "@/components/Skeleton";
import { RevenueAnalyticsPanel } from "@/components/RevenueAnalyticsPanel";

/**
 * "Statistiche" per il professionista — richiesta esplicita dell'utente:
 * "il menu statistiche aggiungila anche ai professionisti". Stesso corpo
 * (`RevenueAnalyticsPanel`) e stessa formula della vista admin (CLAUDE.md
 * §99), ma scoped ai soli lavori del professionista autenticato (`GET
 * /professionals/me/revenue-analytics`, `RevenueAnalyticsService.
 * getSummary(professionalProfileId)`) — un professionista vede solo il
 * proprio andamento, mai i dati di altri o della piattaforma intera. Nessun
 * `AdminGuard` sul backend: chiunque abbia un profilo professionista può
 * vedere i propri numeri.
 */
export default function DashboardStatistichePage() {
  const { user, token, isLoading } = useAuth();
  const [data, setData] = useState<RevenueAnalyticsSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token || !user?.isProfessional) return;
    apiClient
      .myRevenueAnalytics(token)
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : "Errore nel caricamento."));
  }, [token, user]);

  if (isLoading) return null;

  if (!user || !token) {
    return (
      <YStack width="100%" alignItems="center" backgroundColor={brand.gesso} paddingVertical="$9" paddingHorizontal="$4">
        <YStack width="100%" maxWidth={480} gap="$4" alignItems="center">
          <Text fontFamily="$heading" fontWeight="800" fontSize="$7" color={brand.grafite} textAlign="center">
            Accedi come professionista
          </Text>
          <Link href="/accedi?redirect=/dashboard/statistiche" style={{ textDecoration: "none" }}>
            <Button variant="primary">Accedi</Button>
          </Link>
        </YStack>
      </YStack>
    );
  }

  if (!user.isProfessional) {
    return (
      <YStack width="100%" alignItems="center" backgroundColor={brand.gesso} paddingVertical="$9" paddingHorizontal="$4">
        <YStack width="100%" maxWidth={480} gap="$3" alignItems="center">
          <Text fontFamily="$heading" fontWeight="800" fontSize="$7" color={brand.grafite} textAlign="center">
            Questa sezione è per i professionisti
          </Text>
        </YStack>
      </YStack>
    );
  }

  return (
    <YStack width="100%" alignItems="center" paddingVertical="$8" paddingHorizontal="$4">
      <YStack width="100%" maxWidth={1000} gap="$7">
        <XStack alignItems="center" gap="$3">
          <YStack
            width={44}
            height={44}
            borderRadius={999}
            alignItems="center"
            justifyContent="center"
            backgroundColor={brand.cianografiaVelo}
          >
            <Icon name="trending-up" size={22} color={brand.cianografiaScuro} />
          </YStack>
          <YStack>
            <Text fontFamily="$heading" fontWeight="800" fontSize={30}>
              Statistiche
            </Text>
            <Text fontSize={13} color={brand.grafite70}>
              Le entrate generate dai tuoi lavori completati
            </Text>
          </YStack>
        </XStack>

        {error ? <Text color={brand.urgenza}>{error}</Text> : null}

        {data === null && !error ? (
          <SkeletonRevenuePanel />
        ) : data ? (
          <RevenueAnalyticsPanel
            data={data}
            chartCaption="Solo i tuoi lavori confermati completati da entrambe le parti (tu e il cliente). Passa il mouse su un punto per i dettagli."
          />
        ) : null}
      </YStack>
    </YStack>
  );
}
