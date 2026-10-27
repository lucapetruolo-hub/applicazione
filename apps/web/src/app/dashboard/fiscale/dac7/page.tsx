"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { dac7AnnualDeadline, formatEurCents, type Dac7YearSummary } from "@professionisti/shared";
import { Badge, Button, EmptyState, Section, Surface, Text, XStack, YStack, brand } from "@professionisti/ui";
import { LearnMore } from "@/components/LearnMore";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/lib/AuthContext";

const QUARTER_LABEL: Record<1 | 2 | 3 | 4, string> = { 1: "Gen – Mar", 2: "Apr – Giu", 3: "Lug – Set", 4: "Ott – Dic" };

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" });
}

function yearStatus(summary: Dac7YearSummary): { variant: "verificato" | "nuovo" | "urgente"; label: string; detail: string } {
  const currentYear = new Date().getFullYear();
  if (summary.submittedAt) {
    return {
      variant: "verificato",
      label: "Comunicato al fisco",
      detail: `Inviato il ${formatDate(summary.submittedAt)}.`,
    };
  }
  if (summary.year >= currentYear) {
    return { variant: "nuovo", label: "Anno in corso", detail: "Si aggiorna ogni notte." };
  }
  return {
    variant: "nuovo",
    label: "In preparazione",
    detail: `Da comunicare entro il ${formatDate(dac7AnnualDeadline(summary.year))}.`,
  };
}

/**
 * Riepilogo DAC7 per il professionista (docs/CHANGELOG.md §246): cosa
 * comunichiamo al fisco su di lui, anno per anno e trimestre per trimestre,
 * con diretti e online separati. È anche la pagina a cui porta l'avviso
 * annuale che la direttiva ci chiede di mandare.
 */
export default function Dac7SummaryPage() {
  const { token, isLoading } = useAuth();
  const [data, setData] = useState<{ years: Dac7YearSummary[]; maskedIban: string | null } | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);

  useEffect(() => {
    if (!token) return;
    apiClient
      .myDac7Summary(token)
      .then((result) => {
        setData(result);
        setSelectedYear(result.years[0]?.year ?? null);
      })
      .catch((e) => {
        setData(null);
        setError(e instanceof Error ? e.message : "Non riusciamo a caricare il riepilogo: riprova tra poco.");
      });
  }, [token]);

  const summary = data?.years.find((y) => y.year === selectedYear) ?? null;
  const hasOnline = summary?.quarters.some((q) => q.onlineEurCents > 0) ?? false;

  return (
    // Stampabile come i documenti di "Fatture e documenti" (docs/CHANGELOG.md §372).
    <div className="print-document">
      <Section title="Riepilogo annuale dei compensi (DAC7)" maxWidth={760}>
        <YStack gap="$5">
          <span data-print-hide>
            <Link href="/dashboard/fiscale" style={{ color: brand.cianografiaScuro, fontWeight: 700, fontSize: 16, textDecoration: "none" }}>
              ← Dati fiscali e pagamenti
            </Link>
          </span>

          <div data-print-hide>
            <LearnMore fontSize={16} summary="I compensi che comunichiamo ogni anno al fisco.">
              <Text fontSize={16} color={brand.grafite70}>
                Lo chiede la direttiva europea DAC7: entro il 31 gennaio comunichiamo i compensi dell&apos;anno prima, insieme ai tuoi dati fiscali,
                e ti avvisiamo per email.
              </Text>
              <Text fontSize={16} color={brand.grafite70}>
                Gli importi sono quelli che indichi a &quot;Lavoro terminato&quot;. Quelli online sono al netto della nostra trattenuta (con
                l&apos;IVA), che comunichiamo a parte.
              </Text>
            </LearnMore>
          </div>

          {isLoading || data === undefined ? (
            <YStack gap="$3" aria-busy>
              <YStack height={88} borderRadius="$3" backgroundColor={brand.gesso} />
              <YStack height={140} borderRadius="$3" backgroundColor={brand.gesso} />
            </YStack>
          ) : error ? (
            <Text fontSize={16} color={brand.urgenza} role="alert">
              {error}
            </Text>
          ) : !data || data.years.length === 0 || !summary ? (
            <EmptyState
              icon="coins"
              title="Ancora nessun compenso da comunicare"
              description="Compaiono qui quando chiudi un lavoro."
            />
          ) : (
            <YStack gap="$4">
              {data.years.length > 1 ? (
                <div data-print-hide>
                  <XStack gap="$2" flexWrap="wrap" role="tablist" aria-label="Anno">
                    {data.years.map((y) => (
                      <Button
                        key={y.year}
                        size="$3"
                        variant={y.year === selectedYear ? "primary" : "secondary"}
                        onPress={() => setSelectedYear(y.year)}
                        role="tab"
                        aria-selected={y.year === selectedYear}
                      >
                        {String(y.year)}
                      </Button>
                    ))}
                  </XStack>
                </div>
              ) : null}

              <Surface padding="$4">
                <YStack gap="$2">
                  <XStack justifyContent="space-between" alignItems="center" gap="$3" flexWrap="wrap">
                    <Text fontSize={16} fontWeight="700" color={brand.grafite70}>
                      Compensi {summary.year}
                    </Text>
                    <Badge variant={yearStatus(summary).variant}>{yearStatus(summary).label}</Badge>
                  </XStack>
                  <Text fontFamily="$heading" fontSize={32} fontWeight="800" color={brand.grafite}>
                    {formatEurCents(summary.totalEurCents)}
                  </Text>
                  <Text fontSize={16} color={brand.grafite70}>
                    {yearStatus(summary).detail}
                    {summary.notifiedAt ? ` Ti abbiamo inviato l'avviso il ${formatDate(summary.notifiedAt)}.` : ""}
                  </Text>
                </YStack>
              </Surface>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
                {([1, 2, 3, 4] as const).map((q) => {
                  const quarter = summary.quarters.find((item) => item.quarter === q);
                  const empty = !quarter || quarter.jobs === 0;
                  return (
                    <Surface key={q} padding="$3" opacity={empty ? 0.6 : 1}>
                      <YStack gap="$2">
                        <XStack justifyContent="space-between" alignItems="baseline">
                          <Text fontSize={16} fontWeight="800" color={brand.grafite}>
                            {q}° trimestre
                          </Text>
                          <Text fontSize={13} color={brand.grafite70}>
                            {QUARTER_LABEL[q]}
                          </Text>
                        </XStack>
                        {empty ? (
                          <Text fontSize={16} color={brand.grafite70}>
                            Nessun lavoro
                          </Text>
                        ) : (
                          <YStack gap={4}>
                            <QuarterRow label="Pagati direttamente" value={formatEurCents(quarter.directEurCents)} />
                            <QuarterRow label="Pagati online" value={formatEurCents(quarter.onlineEurCents)} />
                            {quarter.feesEurCents > 0 ? <QuarterRow label="Trattenute (con IVA)" value={formatEurCents(quarter.feesEurCents)} muted /> : null}
                            <QuarterRow label="Lavori" value={String(quarter.jobs)} muted />
                          </YStack>
                        )}
                      </YStack>
                    </Surface>
                  );
                })}
              </div>

              {hasOnline ? (
                data.maskedIban ? (
                  <Text fontSize={16} color={brand.grafite70}>
                    Conto dei pagamenti online: <Text fontVariant={["tabular-nums"]} fontWeight="700" color={brand.grafite}>{data.maskedIban}</Text>
                  </Text>
                ) : (
                  <XStack gap="$3" padding="$3" borderRadius="$3" backgroundColor={brand.urgenzaVelo} alignItems="center" justifyContent="space-between" flexWrap="wrap">
                    <Text fontSize={16} fontWeight="700" color={brand.grafite}>
                      Manca l&apos;IBAN dei pagamenti online
                    </Text>
                    <Link href="/dashboard/fiscale" style={{ color: brand.cianografiaScuro, fontWeight: 700, fontSize: 16 }}>
                      Aggiungilo →
                    </Link>
                  </XStack>
                )
              ) : null}

              <div data-print-hide>
                <Button alignSelf="flex-start" variant="secondary" onPress={() => window.print()}>
                  Scarica PDF
                </Button>
              </div>
            </YStack>
          )}

          <div data-print-hide>
            <Text fontSize={16} color={brand.grafite70}>
              Qualcosa non torna?{" "}
              <Link href="/contatti" style={{ color: brand.cianografiaScuro, fontWeight: 700 }}>
                Scrivici
              </Link>
            </Text>
          </div>
        </YStack>
      </Section>
    </div>
  );
}

function QuarterRow({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <XStack justifyContent="space-between" gap="$2">
      <Text fontSize={16} color={brand.grafite70}>
        {label}
      </Text>
      <Text fontSize={16} fontWeight={muted ? "400" : "700"} color={muted ? brand.grafite70 : brand.grafite}>
        {value}
      </Text>
    </XStack>
  );
}
