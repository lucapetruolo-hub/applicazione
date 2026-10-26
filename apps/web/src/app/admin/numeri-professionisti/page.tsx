"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  FOUNDER_SPOTS,
  PROFESSIONAL_CATEGORIES,
  PROFESSIONAL_ENTITY_LABEL,
  PROFESSIONAL_PLAN_LABEL,
  PROFESSIONAL_STATUS_LABEL,
  sharePercentLabel,
  type AdminProfessionalStats,
} from "@professionisti/shared";
import { Button, Text, YStack, brand } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/lib/AuthContext";
import { AdminCard, AdminPageHeader, errorMessage } from "@/components/admin/adminUi";
import { StatsBarChart } from "@/components/StatsBarChart";
import { SkeletonTableRows } from "@/components/Skeleton";

/** Città mostrate una per una; le altre in una riga sola. */
const TOP_CITIES = 10;

type Filters = { category?: string; city?: string };

/**
 * Professionisti in numeri (richiesta dell'utente, docs/CHANGELOG.md §368):
 * quanti sono e come si dividono, con quota e barra per ogni voce. Filtri
 * per categoria e città; ogni riga di categoria o città apre l'elenco in
 * Utenti con gli stessi filtri.
 */
export default function AdminNumeriProfessionistiPage() {
  return (
    <Suspense fallback={null}>
      <NumeriContent />
    </Suspense>
  );
}

function usersHref(filters: Filters): string {
  const params = new URLSearchParams({ ruolo: "PROFESSIONAL" });
  if (filters.category) params.set("categoria", filters.category);
  if (filters.city) params.set("citta", filters.city);
  return `/admin/utenti?${params}`;
}

function NumeriContent() {
  const { token } = useAuth();
  const searchParams = useSearchParams();
  const [filters, setFilters] = useState<Filters>({
    category: searchParams.get("categoria") ?? undefined,
    city: searchParams.get("citta") ?? undefined,
  });
  const [loaded, setLoaded] = useState<{ filters: Filters; data: AdminProfessionalStats } | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Le città del filtro restano quelle della prima risposta senza filtri.
  const [cityOptions, setCityOptions] = useState<string[]>([]);
  const data = loaded?.filters === filters ? loaded.data : null;

  useEffect(() => {
    if (!token) return;
    apiClient
      .adminProfessionalStats(token, filters)
      .then((stats) => {
        setLoaded({ filters, data: stats });
        setCityOptions((prev) => (prev.length ? prev : stats.cityOptions));
        setError(null);
      })
      .catch((err) => setError(errorMessage(err)));
  }, [token, filters]);

  const filtered = Boolean(filters.category || filters.city);
  const categoryLabel = PROFESSIONAL_CATEGORIES.find((c) => c.slug === filters.category)?.label;
  const scope = [categoryLabel, filters.city].filter(Boolean).join(" a ");

  return (
    <YStack gap="$5">
      <AdminPageHeader
        title="Professionisti in numeri"
        description="Quanti sono e come si dividono. Ogni barra mostra la quota sul totale."
        right={
          <Link href={usersHref(filters)} className="admin-link-button">
            Vedi l&apos;elenco
          </Link>
        }
      />

      <div className="admin-filters">
        <select
          aria-label="Categoria"
          className="admin-input"
          value={filters.category ?? ""}
          onChange={(e) => setFilters((prev) => ({ ...prev, category: e.target.value || undefined }))}
        >
          <option value="">Tutte le categorie</option>
          {PROFESSIONAL_CATEGORIES.map((c) => (
            <option key={c.slug} value={c.slug}>
              {c.label}
            </option>
          ))}
        </select>
        <select
          aria-label="Città"
          className="admin-input"
          value={filters.city ?? ""}
          onChange={(e) => setFilters((prev) => ({ ...prev, city: e.target.value || undefined }))}
        >
          <option value="">Tutte le città</option>
          {/* Una città arrivata dal link ma senza professionisti resta scelta. */}
          {[...new Set([...(filters.city ? [filters.city] : []), ...cityOptions])].map((city) => (
            <option key={city} value={city}>
              {city}
            </option>
          ))}
        </select>
        {filtered ? (
          <Button variant="secondary" size="$3" onPress={() => setFilters({})}>
            Togli i filtri
          </Button>
        ) : null}
      </div>

      {error ? <Text color={brand.urgenza}>{error}</Text> : null}

      {data === null && !error ? (
        <SkeletonTableRows rows={6} cols={3} />
      ) : data ? (
        <StatsBody data={data} filters={filters} scope={scope} />
      ) : null}
    </YStack>
  );
}

function StatsBody({ data, filters, scope }: { data: AdminProfessionalStats; filters: Filters; scope: string }) {
  const visible = data.byStatus.find((s) => s.key === "VISIBLE")?.count ?? 0;
  const founders = data.byPlan.find((p) => p.key === "FOUNDER")?.count ?? 0;
  const excluded = [
    data.excluded.deleted ? `${data.excluded.deleted} ${data.excluded.deleted === 1 ? "eliminato" : "eliminati"}` : null,
    data.excluded.demo ? `${data.excluded.demo} ${data.excluded.demo === 1 ? "profilo dimostrativo" : "profili dimostrativi"}` : null,
  ].filter(Boolean);

  const cities = data.byCity.slice(0, TOP_CITIES);
  const otherCities = data.byCity.slice(TOP_CITIES);
  // Periodo del grafico: gli ultimi 12 mesi o un anno intero (richiesta di Luca, §368).
  const [period, setPeriod] = useState<string>("last12");
  const years = useMemo(() => [...new Set(data.byMonth.map((m) => m.key.slice(0, 4)))].reverse(), [data.byMonth]);
  const months = useMemo(() => {
    const shown = period === "last12" ? data.byMonth.slice(-12) : data.byMonth.filter((m) => m.key.startsWith(`${period}-`));
    return shown.map((m) => {
      const [year, month] = m.key.split("-").map(Number) as [number, number];
      const date = new Date(Date.UTC(year, month - 1, 1));
      const label = new Intl.DateTimeFormat("it-IT", period === "last12" ? { month: "short", year: "2-digit", timeZone: "UTC" } : { month: "short", timeZone: "UTC" }).format(date);
      return { key: m.key, label, value: m.count };
    });
  }, [data.byMonth, period]);
  const periodTotal = months.reduce((sum, m) => sum + m.value, 0);

  return (
    <YStack gap="$5">
      <div className="admin-kpi-grid">
        <div className="admin-kpi">
          <span className="admin-kpi-value">{data.total}</span>
          <span className="admin-kpi-label">{scope ? `Professionisti (${scope})` : "Professionisti"}</span>
        </div>
        <div className="admin-kpi">
          <span className="admin-kpi-value">{visible}</span>
          <span className="admin-kpi-label">Visibili nella ricerca · {sharePercentLabel(visible, data.total)}</span>
        </div>
        <div className="admin-kpi">
          <span className="admin-kpi-value">{data.new30d}</span>
          <span className="admin-kpi-label">Nuovi negli ultimi 30 giorni</span>
        </div>
        <div className="admin-kpi">
          <span className="admin-kpi-value">{founders}</span>
          <span className="admin-kpi-label">Nell&apos;offerta di lancio (su {FOUNDER_SPOTS})</span>
        </div>
      </div>

      {data.total === 0 ? (
        <Text color={brand.grafite70}>Nessun professionista con questi filtri.</Text>
      ) : (
        <div className="admin-stats-grid">
          <BarSection
            title="Per categoria"
            note="Un professionista può offrire fino a 3 categorie: la somma supera il totale."
            total={data.total}
            rows={data.byCategory.map((c) => ({ key: c.slug, label: c.label, count: c.count, href: usersHref({ ...filters, category: c.slug }) }))}
          />
          <BarSection
            title="Per città"
            total={data.total}
            rows={[
              ...cities.map((c) => ({ key: c.city, label: c.city, count: c.count, href: usersHref({ ...filters, city: c.city }) })),
              ...(otherCities.length
                ? [
                    {
                      key: "altre",
                      label: `Altre ${otherCities.length} città`,
                      count: otherCities.reduce((sum, c) => sum + c.count, 0),
                    },
                  ]
                : []),
            ]}
          />
          <BarSection
            title="Stato del profilo"
            total={data.total}
            rows={data.byStatus.map((s) => ({ key: s.key, label: PROFESSIONAL_STATUS_LABEL[s.key], count: s.count }))}
          />
          <BarSection
            title="Abbonamento"
            total={data.total}
            rows={data.byPlan.map((p) => ({ key: p.key, label: PROFESSIONAL_PLAN_LABEL[p.key], count: p.count }))}
          />
          <BarSection
            title="Come lavorano"
            total={data.total}
            rows={data.byEntity.map((e) => ({ key: e.key, label: PROFESSIONAL_ENTITY_LABEL[e.key], count: e.count }))}
          />
        </div>
      )}

      <AdminCard>
        <div className="admin-chart-head">
          <YStack gap="$1">
            <Text fontFamily="$heading" fontWeight="800" fontSize="$6" color={brand.grafite}>
              Iscrizioni per mese
            </Text>
            <Text color={brand.grafite70} fontSize={13}>
              {periodTotal === 1 ? "1 professionista" : `${periodTotal} professionisti`} {period === "last12" ? "negli ultimi 12 mesi" : `nel ${period}`}
            </Text>
          </YStack>
          <select aria-label="Periodo del grafico" className="admin-input" value={period} onChange={(e) => setPeriod(e.target.value)}>
            <option value="last12">Ultimi 12 mesi</option>
            {years.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
        </div>
        <StatsBarChart points={months} formatValue={(v) => String(v)} ariaLabel="Professionisti iscritti per mese" />
      </AdminCard>

      {excluded.length ? <Text color={brand.grafite70} fontSize={13}>Non contati: {excluded.join(" e ")}.</Text> : null}
    </YStack>
  );
}

type BarRow = { key: string; label: string; count: number; href?: string };

/** Elenco di barre orizzontali: nome, numero e quota sul totale, barra lunga quanto la quota. */
function BarSection({ title, note, total, rows }: { title: string; note?: string; total: number; rows: BarRow[] }) {
  return (
    <AdminCard>
      <Text fontFamily="$heading" fontWeight="800" fontSize="$6" color={brand.grafite}>
        {title}
      </Text>
      <ul className="admin-bars">
        {rows.map((row) => {
          const width = total > 0 ? Math.min(100, (row.count / total) * 100) : 0;
          const label = row.href && row.count > 0 ? <Link href={row.href}>{row.label}</Link> : row.label;
          return (
            <li key={row.key} className={row.count === 0 ? "is-zero" : undefined}>
              <div className="admin-bars-head">
                <span className="admin-bars-label">{label}</span>
                <span className="admin-bars-value">
                  <strong>{row.count}</strong> · {sharePercentLabel(row.count, total)}
                </span>
              </div>
              <div className="admin-bars-track" aria-hidden="true">
                <div className="admin-bars-fill" style={{ width: `${width}%` }} />
              </div>
            </li>
          );
        })}
      </ul>
      {note ? (
        <Text color={brand.grafite70} fontSize={12}>
          {note}
        </Text>
      ) : null}
    </AdminCard>
  );
}
