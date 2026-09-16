"use client";

import { useMemo, useState } from "react";
import type { RevenueAnalyticsSummary } from "@professionisti/api-client";
import { Icon, Surface, Text, XStack, YStack, brand, radiusDoc } from "@professionisti/ui";
import { RevenueTrendChart } from "@/components/RevenueTrendChart";

export function formatEuro(cents: number): string {
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(cents / 100);
}

function jobsLabel(count: number): string {
  return `${count} ${count === 1 ? "lavoro completato" : "lavori completati"}`;
}

// Selettore range temporale del grafico (richiesta esplicita dell'utente:
// "fai selezionare un range temporale visualizzabile sul grafico... i dati
// si andranno ad aggiornare") — `months: null` = "Tutto", nessun taglio.
// Il default (12) coincide con il comportamento fisso di prima di questa
// funzionalità, nessuna sorpresa visiva finché non si cambia selezione.
const RANGE_OPTIONS = [
  { key: "3", label: "3 mesi", months: 3 },
  { key: "6", label: "6 mesi", months: 6 },
  { key: "12", label: "12 mesi", months: 12 },
  { key: "24", label: "24 mesi", months: 24 },
  { key: "all", label: "Tutto", months: null },
] as const;

type RangeKey = (typeof RANGE_OPTIONS)[number]["key"];

function rangeHeadingSuffix(key: RangeKey): string {
  const option = RANGE_OPTIONS.find((o) => o.key === key);
  return option?.months ? `ultimi ${option.months} mesi` : "storico completo";
}

/**
 * Corpo del pannello "Statistiche" (Revenue Analytics, CLAUDE.md §99) — 4
 * tessere KPI + grafico andamento mensile. Estratto in un componente
 * condiviso quando la stessa vista è stata richiesta anche per il
 * professionista (§103), scoped ai propri dati invece che a tutta la
 * piattaforma: stesso identico calcolo/formula, cambia solo il testo
 * introduttivo (passato dal chiamante) e la fonte dei dati (già filtrata
 * lato server, questo componente non lo sa né deve saperlo).
 *
 * Le 4 tessere KPI (anno/mese/variazione/da sempre) restano fisse a
 * prescindere dal range scelto sul grafico — richiesta esplicita
 * dell'utente scoped al solo grafico ("visualizzabile sul grafico"), non
 * a metriche assolute che non hanno un "range" a cui appartenere. Il
 * filtro è puramente client-side (nessun nuovo round-trip di rete per
 * ogni cambio range, stesso principio già seguito altrove nel progetto
 * per i filtri di ricerca/liste): `data.monthlySeries` arriva già intera
 * dal backend (zero-filled dal primo mese con dati ad oggi, non più un
 * trailing fisso a 12), questo componente ne prende solo la coda giusta.
 */
export function RevenueAnalyticsPanel({ data, chartCaption }: { data: RevenueAnalyticsSummary; chartCaption: string }) {
  const currentMonthLabel = new Date().toLocaleDateString("it-IT", { month: "long", year: "numeric" });
  const currentYearLabel = new Date().getFullYear().toString();
  const [range, setRange] = useState<RangeKey>("12");

  const activeOption = RANGE_OPTIONS.find((o) => o.key === range) ?? RANGE_OPTIONS[2];
  const visiblePoints = useMemo(
    () => (activeOption.months ? data.monthlySeries.slice(-activeOption.months) : data.monthlySeries),
    [data.monthlySeries, activeOption.months],
  );

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
        <XStack justifyContent="space-between" alignItems="flex-start" flexWrap="wrap" gap="$3">
          <YStack gap="$1" flexBasis={0} flexGrow={1} minWidth={220}>
            <Text fontWeight="700" fontSize={17}>
              Andamento entrate — {rangeHeadingSuffix(range)}
            </Text>
            <Text fontSize={12} color={brand.grafite70}>
              {chartCaption}
            </Text>
          </YStack>

          <XStack borderRadius={999} borderWidth={1} borderColor={brand.filetto} overflow="hidden" flexShrink={0}>
            {RANGE_OPTIONS.map((opt) => {
              const active = opt.key === range;
              return (
                <XStack
                  key={opt.key}
                  paddingHorizontal="$3"
                  paddingVertical={9}
                  backgroundColor={active ? brand.cianografia : brand.calce}
                  cursor="pointer"
                  onPress={() => setRange(opt.key)}
                  accessibilityRole="button"
                  accessibilityLabel={`Mostra ${opt.label === "Tutto" ? "tutto lo storico" : "gli ultimi " + opt.label} nel grafico`}
                >
                  <Text fontSize={12.5} fontWeight="700" color={active ? "white" : brand.grafite}>
                    {opt.label}
                  </Text>
                </XStack>
              );
            })}
          </XStack>
        </XStack>
        <RevenueTrendChart points={visiblePoints} rangeLabel={rangeHeadingSuffix(range)} />
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
