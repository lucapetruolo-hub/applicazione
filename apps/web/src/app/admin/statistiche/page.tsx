"use client";

import { useEffect, useState } from "react";
import type {
  AdminNotificationOptOutGroup,
  AdminTrafficSources,
  RevenueAnalyticsSummary,
} from "@professionisti/api-client";
import { Paragraph, Text, YStack, brand } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/lib/AuthContext";
import { SkeletonRevenuePanel } from "@/components/Skeleton";
import { RevenueAnalyticsPanel } from "@/components/RevenueAnalyticsPanel";
import { TrafficSourcesPanel } from "@/components/TrafficSourcesPanel";
import { NotificationOptOutsPanel } from "@/components/NotificationOptOutsPanel";
import { AdminPageHeader } from "@/components/admin/adminUi";

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
  const [traffic, setTraffic] = useState<AdminTrafficSources | null>(null);
  const [optOuts, setOptOuts] = useState<AdminNotificationOptOutGroup[] | null>(
    null,
  );

  useEffect(() => {
    if (!token || user?.role !== "ADMIN") return;
    apiClient
      .adminRevenueAnalytics(token)
      .then(setData)
      .catch((err) =>
        setError(
          err instanceof Error ? err.message : "Errore nel caricamento.",
        ),
      );
    // Pannello a parte: se non risponde, le entrate restano visibili.
    apiClient
      .adminTrafficSources(token)
      .then(setTraffic)
      .catch(() => setTraffic(null));
    apiClient
      .adminNotificationOptOuts(token)
      .then(setOptOuts)
      .catch(() => setOptOuts(null));
  }, [token, user]);

  if (isLoading) return null;

  if (!user || !token || user.role !== "ADMIN") {
    return (
      <YStack
        width="100%"
        alignItems="center"
        paddingVertical="$9"
        paddingHorizontal="$4"
      >
        <Paragraph color={brand.grafite70}>
          Questa pagina è visibile solo agli amministratori.
        </Paragraph>
      </YStack>
    );
  }

  return (
    <YStack gap="$7">
      <AdminPageHeader
        title="Entrate"
        description="Entrate dai lavori completati, da dove arrivano le visite e chi ha spento le notifiche."
      />
      {error ? <Text color={brand.urgenza}>{error}</Text> : null}

      {data === null && !error ? (
        <SkeletonRevenuePanel />
      ) : data ? (
        <RevenueAnalyticsPanel
          data={data}
          chartCaption="Solo lavori confermati completati da entrambe le parti (professionista e cliente), su tutta la piattaforma. Passa il mouse su un punto per i dettagli."
        />
      ) : null}

      {traffic ? <TrafficSourcesPanel data={traffic} /> : null}

      {optOuts ? <NotificationOptOutsPanel data={optOuts} /> : null}
    </YStack>
  );
}
