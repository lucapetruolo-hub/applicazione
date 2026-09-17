"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { RevenueAnalyticsSummary } from "@professionisti/api-client";
import { Icon, Paragraph, Text, XStack, YStack, brand } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/lib/AuthContext";
import { SkeletonRevenuePanel } from "@/components/Skeleton";
import { RevenueAnalyticsPanel } from "@/components/RevenueAnalyticsPanel";

/**
 * "Statistiche" → Revenue Analytics (richiesta esplicita dell'utente,
 * CLAUDE.md §99): il totale delle entrate generate dall'applicazione quando
 * un lavoro viene selezionato come completato sia dal cliente che dal
 * professionista — totale dell'anno in corso, totale del mese, variazione
 * rispetto al mese precedente, più un grafico dell'andamento mensile. Pagina
 * separata da /admin/finanza (che traccia il ricavo di PIATTAFORMA — la sola
 * commissione — non ancora attivo in produzione): questa misura il valore
 * lordo del lavoro reale svolto, disponibile fin da subito.
 *
 * Corpo (tessere KPI + grafico) estratto in `RevenueAnalyticsPanel`
 * (condiviso con la versione per il professionista, §103) — questa pagina
 * resta responsabile solo di guardia ruolo, fetch e intestazione.
 */
export default function AdminStatistichePage() {
  const { user, token, isLoading } = useAuth();
  const [data, setData] = useState<RevenueAnalyticsSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token || user?.role !== "ADMIN") return;
    apiClient
      .adminRevenueAnalytics(token)
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : "Errore nel caricamento."));
  }, [token, user]);

  if (isLoading) return null;

  if (!user || !token || user.role !== "ADMIN") {
    return (
      <YStack width="100%" alignItems="center" paddingVertical="$9" paddingHorizontal="$4">
        <Paragraph color={brand.grafite70}>Questa pagina è visibile solo agli amministratori.</Paragraph>
      </YStack>
    );
  }

  return (
    <YStack width="100%" alignItems="center" paddingVertical="$8" paddingHorizontal="$4">
      <YStack width="100%" maxWidth={960} gap="$7">
        <YStack gap="$2">
          <Link href="/admin" style={{ textDecoration: "none" }}>
            <Text color={brand.cianografia} fontSize={13}>
              ← Torna ad Amministrazione
            </Text>
          </Link>
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
                Revenue Analytics — entrate generate dai lavori completati
              </Text>
            </YStack>
          </XStack>
        </YStack>

        {error ? <Text color={brand.urgenza}>{error}</Text> : null}

        {data === null && !error ? (
          <SkeletonRevenuePanel />
        ) : data ? (
          <RevenueAnalyticsPanel
            data={data}
            chartCaption="Solo lavori confermati completati da entrambe le parti (professionista e cliente), su tutta la piattaforma. Passa il mouse su un punto per i dettagli."
          />
        ) : null}
      </YStack>
    </YStack>
  );
}
