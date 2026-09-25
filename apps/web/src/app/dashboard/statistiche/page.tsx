"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { ProfessionalStats, ProfessionalStatsBucket, ProfessionalStatsTotals } from "@professionisti/shared";
import { Button, Icon, Text, XStack, YStack, brand } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/lib/AuthContext";
import { SkeletonRevenuePanel } from "@/components/Skeleton";
import { StatsBarChart } from "@/components/StatsBarChart";

/**
 * "Statistiche" del professionista (docs/CHANGELOG.md §149, richiesta
 * esplicita dell'utente: "migliora la pagina statistiche e aggiungi un
 * filtro dove puoi selezionare un periodo"). Prima mostrava solo le entrate
 * (stesso pannello dell'admin, §103); ora tutto il percorso di un lavoro nel
 * periodo scelto: visite al profilo, richieste, preventivi, lavori ottenuti,
 * completati ed entrate, ognuno confrontato col periodo precedente di pari
 * durata. Il periodo vale per tutta la pagina (tessere, grafico, rapporti),
 * non solo per il grafico. Solo i propri dati (`GET /professionals/me/stats`).
 */

type MetricKey = Exclude<keyof ProfessionalStatsBucket, "key" | "label">;

const METRICS: { key: MetricKey; label: string; icon: "eye" | "file-text" | "send" | "badge-check" | "check" | "coins"; hint: string }[] = [
  { key: "views", label: "Visite al profilo", icon: "eye", hint: "Quante volte è stato aperto il tuo profilo pubblico" },
  { key: "requests", label: "Richieste ricevute", icon: "file-text", hint: "Richieste di preventivo arrivate a te" },
  { key: "quotes", label: "Preventivi inviati", icon: "send", hint: "Preventivi che hai mandato" },
  { key: "won", label: "Lavori ottenuti", icon: "badge-check", hint: "Preventivi accettati e prenotazioni dirette" },
  { key: "completed", label: "Lavori completati", icon: "check", hint: "Confermati come terminati da te e dal cliente" },
  { key: "revenueEurCents", label: "Entrate", icon: "coins", hint: "Importi finali dei lavori completati" },
];

type PresetKey = "7d" | "30d" | "90d" | "365d" | "year" | "custom";
const PRESETS: { key: PresetKey; label: string }[] = [
  { key: "7d", label: "7 giorni" },
  { key: "30d", label: "30 giorni" },
  { key: "90d", label: "3 mesi" },
  { key: "365d", label: "12 mesi" },
  { key: "year", label: "Quest'anno" },
  { key: "custom", label: "Personalizzato" },
];

const MAX_SPAN_DAYS = 731;

function isoDay(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function presetRange(key: Exclude<PresetKey, "custom">): { from: string; to: string } {
  const today = new Date();
  const start = new Date(today);
  if (key === "year") return { from: `${today.getFullYear()}-01-01`, to: isoDay(today) };
  const days = key === "7d" ? 7 : key === "30d" ? 30 : key === "90d" ? 90 : 365;
  start.setDate(today.getDate() - (days - 1));
  return { from: isoDay(start), to: isoDay(today) };
}

function formatDay(iso: string, withYear = true): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString("it-IT", { day: "numeric", month: "short", ...(withYear ? { year: "numeric" } : {}) });
}

function formatRange(from: string, to: string): string {
  return from.slice(0, 4) === to.slice(0, 4) ? `${formatDay(from, false)} – ${formatDay(to)}` : `${formatDay(from)} – ${formatDay(to)}`;
}

function formatEuro(cents: number): string {
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(cents / 100);
}

function formatMetric(key: MetricKey, value: number): string {
  return key === "revenueEurCents" ? formatEuro(value) : new Intl.NumberFormat("it-IT").format(Math.round(value));
}

function percent(numerator: number, denominator: number): string {
  return denominator > 0 ? `${Math.round((numerator / denominator) * 100)}%` : "—";
}

export default function DashboardStatistichePage() {
  const { user, token, isLoading } = useAuth();
  const [preset, setPreset] = useState<PresetKey>("30d");
  const [range, setRange] = useState(() => presetRange("30d"));
  const [customFrom, setCustomFrom] = useState(range.from);
  const [customTo, setCustomTo] = useState(range.to);
  const [customError, setCustomError] = useState<string | null>(null);
  const [metric, setMetric] = useState<MetricKey>("requests");
  const [data, setData] = useState<ProfessionalStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!token || !user?.isProfessional) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    apiClient
      .myProfessionalStats(token, range.from, range.to)
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Errore nel caricamento.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token, user, range.from, range.to]);

  function choosePreset(key: PresetKey) {
    setPreset(key);
    setCustomError(null);
    if (key === "custom") {
      setCustomFrom(range.from);
      setCustomTo(range.to);
      return;
    }
    setRange(presetRange(key));
  }

  function applyCustom() {
    if (!customFrom || !customTo) return setCustomError("Scegli entrambe le date.");
    if (customFrom > customTo) return setCustomError("La data di inizio deve venire prima di quella di fine.");
    const span = (new Date(`${customTo}T12:00:00`).getTime() - new Date(`${customFrom}T12:00:00`).getTime()) / 86_400_000 + 1;
    if (span > MAX_SPAN_DAYS) return setCustomError("Puoi guardare al massimo due anni alla volta.");
    setCustomError(null);
    setRange({ from: customFrom, to: customTo });
  }

  const activeMetric = METRICS.find((m) => m.key === metric) ?? METRICS[1]!;
  const chartPoints = useMemo(
    () => (data ? data.buckets.map((b) => ({ key: b.key, label: b.label, value: b[metric] })) : []),
    [data, metric],
  );

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
        <Text fontFamily="$heading" fontWeight="800" fontSize="$7" color={brand.grafite} textAlign="center">
          Questa sezione è per i professionisti
        </Text>
      </YStack>
    );
  }

  const today = isoDay(new Date());

  return (
    <YStack width="100%" alignItems="center" paddingVertical="$8" paddingHorizontal="$4">
      <YStack width="100%" maxWidth={1000} gap="$5">
        <YStack gap="$1">
          <Text fontFamily="$heading" fontWeight="800" fontSize={30} color={brand.grafite}>
            Statistiche
          </Text>
          <Text fontSize={14} color={brand.grafite70}>
            Dalla visita al tuo profilo al lavoro pagato, nel periodo che scegli.
          </Text>
        </YStack>

        {/* Filtro del periodo: vale per tutta la pagina. */}
        <div className="pstats-filter">
          <div className="pstats-presets" role="group" aria-label="Periodo">
            {PRESETS.map((p) => (
              <button
                key={p.key}
                type="button"
                className={`pstats-preset${preset === p.key ? " is-active" : ""}`}
                aria-pressed={preset === p.key}
                onClick={() => choosePreset(p.key)}
              >
                {p.label}
              </button>
            ))}
          </div>
          {preset === "custom" ? (
            <div className="pstats-custom">
              <label>
                Dal
                <input type="date" value={customFrom} max={customTo || today} onChange={(e) => setCustomFrom(e.target.value)} />
              </label>
              <label>
                Al
                <input type="date" value={customTo} min={customFrom} max={today} onChange={(e) => setCustomTo(e.target.value)} />
              </label>
              <button type="button" className="pstats-apply" onClick={applyCustom}>
                Applica
              </button>
            </div>
          ) : null}
          {customError ? <span className="pstats-error">{customError}</span> : null}
          <span className="pstats-period">
            {formatRange(range.from, range.to)}
            {data ? ` · confronto con ${formatRange(data.previousFrom, data.previousTo)}` : ""}
            {loading && data ? " · aggiornamento…" : ""}
          </span>
        </div>

        {error ? <Text color={brand.urgenza}>{error}</Text> : null}

        {data === null && !error ? (
          <SkeletonRevenuePanel />
        ) : data ? (
          <>
            <div className="pstats-kpis">
              {METRICS.map((m) => (
                <MetricTile
                  key={m.key}
                  metricKey={m.key}
                  label={m.label}
                  icon={m.icon}
                  hint={m.hint}
                  value={data.totals[m.key]}
                  previous={data.previous[m.key]}
                  active={metric === m.key}
                  onSelect={() => setMetric(m.key)}
                />
              ))}
            </div>

            <section className="pstats-card" aria-labelledby="pstats-chart-title">
              <div className="pstats-card-head">
                <div>
                  <h2 id="pstats-chart-title">{activeMetric.label}</h2>
                  <p>
                    {data.granularity === "day" ? "Giorno per giorno" : "Mese per mese"}, {formatRange(data.from, data.to)}. Tocca una tessera sopra per cambiare
                    dato.
                  </p>
                </div>
                <strong>{formatMetric(metric, data.totals[metric])}</strong>
              </div>
              <StatsBarChart
                points={chartPoints}
                formatValue={(v) => formatMetric(metric, v)}
                ariaLabel={`${activeMetric.label}, ${data.granularity === "day" ? "per giorno" : "per mese"}, ${formatRange(data.from, data.to)}`}
              />
              <details className="pstats-table">
                <summary>Mostra i dati in tabella</summary>
                <div className="pstats-table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th scope="col">{data.granularity === "day" ? "Giorno" : "Mese"}</th>
                        {METRICS.map((m) => (
                          <th key={m.key} scope="col">
                            {m.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data.buckets.map((b) => (
                        <tr key={b.key}>
                          <th scope="row">{b.label}</th>
                          {METRICS.map((m) => (
                            <td key={m.key}>{formatMetric(m.key, b[m.key])}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            </section>

            <RatiosSection totals={data.totals} previous={data.previous} />
          </>
        ) : null}
      </YStack>
    </YStack>
  );
}

function deltaOf(value: number, previous: number, metricKey: MetricKey): { text: string; tone: "up" | "down" | "flat" } {
  if (value === previous) return { text: "Come nel periodo prima", tone: "flat" };
  if (previous === 0) return { text: `Prima era ${formatMetric(metricKey, 0)}`, tone: "up" };
  const change = ((value - previous) / previous) * 100;
  return { text: `${change > 0 ? "+" : ""}${Math.round(change)}% rispetto a prima`, tone: change > 0 ? "up" : "down" };
}

function MetricTile({
  metricKey,
  label,
  icon,
  hint,
  value,
  previous,
  active,
  onSelect,
}: {
  metricKey: MetricKey;
  label: string;
  icon: "eye" | "file-text" | "send" | "badge-check" | "check" | "coins";
  hint: string;
  value: number;
  previous: number;
  active: boolean;
  onSelect: () => void;
}) {
  const delta = deltaOf(value, previous, metricKey);
  return (
    <button type="button" className={`pstats-kpi${active ? " is-active" : ""}`} aria-pressed={active} onClick={onSelect} title={hint}>
      <span className="pstats-kpi-label">
        <Icon name={icon} size={15} color={brand.grafite70} />
        {label}
      </span>
      <span className="pstats-kpi-value">{formatMetric(metricKey, value)}</span>
      <span className={`pstats-kpi-delta is-${delta.tone}`}>
        {delta.tone === "up" ? "▲ " : delta.tone === "down" ? "▼ " : ""}
        {delta.text}
      </span>
    </button>
  );
}

/** Rapporti che dicono come stai lavorando, non solo quanto. */
function RatiosSection({ totals, previous }: { totals: ProfessionalStatsTotals; previous: ProfessionalStatsTotals }) {
  const ratios = [
    {
      label: "Richieste a cui hai risposto",
      value: percent(Math.min(totals.quotes, totals.requests), totals.requests),
      detail: `${totals.quotes} preventivi su ${totals.requests} richieste`,
      before: percent(Math.min(previous.quotes, previous.requests), previous.requests),
    },
    {
      label: "Preventivi accettati",
      value: percent(totals.won, totals.quotes),
      detail: `${totals.won} lavori ottenuti su ${totals.quotes} preventivi`,
      before: percent(previous.won, previous.quotes),
    },
    {
      label: "Valore medio per lavoro",
      value: totals.completed > 0 ? formatEuro(totals.revenueEurCents / totals.completed) : "—",
      detail: `${totals.completed} ${totals.completed === 1 ? "lavoro completato" : "lavori completati"}`,
      before: previous.completed > 0 ? formatEuro(previous.revenueEurCents / previous.completed) : "—",
    },
    {
      label: "Recensioni ricevute",
      value: totals.ratingAvg !== null ? `${totals.ratingAvg.toLocaleString("it-IT")} ★` : "—",
      detail: `${totals.reviews} ${totals.reviews === 1 ? "recensione" : "recensioni"} nel periodo`,
      before: previous.ratingAvg !== null ? `${previous.ratingAvg.toLocaleString("it-IT")} ★` : "—",
    },
  ];
  return (
    <section className="pstats-card" aria-labelledby="pstats-ratios-title">
      <div className="pstats-card-head">
        <div>
          <h2 id="pstats-ratios-title">Come stai lavorando</h2>
          <p>Rispondere a più richieste e con preventivi chiari è ciò che fa crescere i lavori ottenuti.</p>
        </div>
      </div>
      <div className="pstats-ratios">
        {ratios.map((r) => (
          <div key={r.label} className="pstats-ratio">
            <span className="pstats-kpi-label">{r.label}</span>
            <span className="pstats-ratio-value">{r.value}</span>
            <span className="pstats-ratio-detail">{r.detail}</span>
            <span className="pstats-ratio-detail">Periodo precedente: {r.before}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
