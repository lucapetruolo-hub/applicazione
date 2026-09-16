"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { RevenueAnalyticsSummary } from "@professionisti/api-client";
import { Icon, Paragraph, Surface, Text, XStack, YStack, brand, radiusDoc } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/lib/AuthContext";
import { LoadingState } from "@/components/LoadingState";
import { RevenueTrendChart } from "@/components/RevenueTrendChart";

function formatEuro(cents: number): string {
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(cents / 100);
}

function jobsLabel(count: number): string {
  return `${count} ${count === 1 ? "lavoro completato" : "lavori completati"}`;
}

/**
 * "Statistiche" → Revenue Analytics (richiesta esplicita dell'utente,
 * CLAUDE.md §99): il totale delle entrate generate dall'applicazione quando
 * un lavoro viene selezionato come completato sia dal cliente che dal
 * professionista — totale dell'anno in corso, totale del mese, variazione
 * rispetto al mese precedente, più un grafico dell'andamento mensile. Pagina
 * separata da /admin/finanza (che traccia il ricavo di PIATTAFORMA — la sola
 * commissione — non ancora attivo in produzione): questa misura il valore
 * lordo del lavoro reale svolto, disponibile fin da subito.
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

  const currentMonthLabel = new Date().toLocaleDateString("it-IT", { month: "long", year: "numeric" });
  const currentYearLabel = new Date().getFullYear().toString();

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
          <LoadingState />
        ) : data ? (
          <>
            <div className="stats-kpi-grid">
              <StatTile
                label={`Entrate ${currentYearLabel}`}
                value={formatEuro(data.currentYearTotalEurCents)}
                subtitle={jobsLabel(data.currentYearJobCount)}
              />
              <StatTile
                label={`Entrate di ${currentMonthLabel}`}
                value={formatEuro(data.currentMonthTotalEurCents)}
                subtitle={jobsLabel(data.currentMonthJobCount)}
              />
              <DeltaStatTile
                previousMonthTotalEurCents={data.previousMonthTotalEurCents}
                currentMonthTotalEurCents={data.currentMonthTotalEurCents}
                monthOverMonthChangePercent={data.monthOverMonthChangePercent}
              />
              <StatTile
                label="Totale generato da sempre"
                value={formatEuro(data.allTimeTotalEurCents)}
                subtitle={jobsLabel(data.allTimeJobCount)}
                accent={false}
              />
            </div>

            <Surface padding="$5" gap="$4">
              <YStack gap="$1">
                <Text fontWeight="700" fontSize={17}>
                  Andamento entrate — ultimi 12 mesi
                </Text>
                <Text fontSize={12} color={brand.grafite70}>
                  Solo lavori confermati completati da entrambe le parti (professionista e cliente). Passa il mouse su un punto per i dettagli.
                </Text>
              </YStack>
              <RevenueTrendChart points={data.monthlySeries} />
            </Surface>
          </>
        ) : null}
      </YStack>
    </YStack>
  );
}

function StatTile({
  label,
  value,
  subtitle,
  accent = true,
}: {
  label: string;
  value: string;
  subtitle: string;
  accent?: boolean;
}) {
  return (
    <Surface padding="$4" gap="$2" borderRadius={radiusDoc}>
      <Text fontSize={12} fontWeight="700" color={brand.grafite70}>
        {label}
      </Text>
      <Text fontSize={26} fontWeight="700" color={accent ? brand.cianografiaScuro : brand.grafite}>
        {value}
      </Text>
      <Text fontSize={12} color={brand.grafite70}>
        {subtitle}
      </Text>
    </Surface>
  );
}

/**
 * Terza tessera KPI richiesta esplicitamente dall'utente — "la variazione
 * rispetto al mese precedente". Una percentuale calcolata da un mese
 * precedente a 0€ sarebbe sempre "+infinito", mai un numero onesto: in quel
 * caso mostra "Nuovo" (se questo mese ha comunque delle entrate) o "—" (se
 * nessuno dei due mesi ne ha) invece di una percentuale finta.
 */
function DeltaStatTile({
  previousMonthTotalEurCents,
  currentMonthTotalEurCents,
  monthOverMonthChangePercent,
}: {
  previousMonthTotalEurCents: number;
  currentMonthTotalEurCents: number;
  monthOverMonthChangePercent: number | null;
}) {
  const hasComparableData = previousMonthTotalEurCents > 0;
  const isUp = monthOverMonthChangePercent !== null && monthOverMonthChangePercent >= 0;
  const color = !hasComparableData
    ? brand.grafite70
    : isUp
      ? brand.verificato
      : brand.urgenza;

  let display: string;
  if (hasComparableData && monthOverMonthChangePercent !== null) {
    display = `${monthOverMonthChangePercent >= 0 ? "+" : ""}${monthOverMonthChangePercent.toFixed(1)}%`;
  } else if (currentMonthTotalEurCents > 0) {
    display = "Nuovo";
  } else {
    display = "—";
  }

  return (
    <Surface padding="$4" gap="$2" borderRadius={radiusDoc}>
      <Text fontSize={12} fontWeight="700" color={brand.grafite70}>
        Variazione vs mese precedente
      </Text>
      <XStack alignItems="center" gap="$2">
        {hasComparableData ? (
          <div style={{ display: "inline-flex", transform: isUp ? undefined : "rotate(135deg)" }}>
            <Icon name="trending-up" size={20} color={color} />
          </div>
        ) : null}
        <Text fontSize={26} fontWeight="700" color={color}>
          {display}
        </Text>
      </XStack>
      <Text fontSize={12} color={brand.grafite70}>
        {hasComparableData ? `Mese precedente: ${formatEuro(previousMonthTotalEurCents)}` : "Nessuna entrata nel mese precedente da confrontare."}
      </Text>
    </Surface>
  );
}
