"use client";

import type { RevenueAnalyticsSummary } from "@professionisti/api-client";
import { Icon, Surface, Text, XStack, YStack, brand, radiusDoc } from "@professionisti/ui";
import { RevenueTrendChart } from "@/components/RevenueTrendChart";

export function formatEuro(cents: number): string {
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(cents / 100);
}

function jobsLabel(count: number): string {
  return `${count} ${count === 1 ? "lavoro completato" : "lavori completati"}`;
}

/**
 * Corpo del pannello "Statistiche" (Revenue Analytics, CLAUDE.md §99) — 4
 * tessere KPI + grafico andamento mensile. Estratto in un componente
 * condiviso quando la stessa vista è stata richiesta anche per il
 * professionista (§103), scoped ai propri dati invece che a tutta la
 * piattaforma: stesso identico calcolo/formula, cambia solo il testo
 * introduttivo (passato dal chiamante) e la fonte dei dati (già filtrata
 * lato server, questo componente non lo sa né deve saperlo).
 */
export function RevenueAnalyticsPanel({ data, chartCaption }: { data: RevenueAnalyticsSummary; chartCaption: string }) {
  const currentMonthLabel = new Date().toLocaleDateString("it-IT", { month: "long", year: "numeric" });
  const currentYearLabel = new Date().getFullYear().toString();

  return (
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
            {chartCaption}
          </Text>
        </YStack>
        <RevenueTrendChart points={data.monthlySeries} />
      </Surface>
    </>
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
  const color = !hasComparableData ? brand.grafite70 : isUp ? brand.verificato : brand.urgenza;

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
