"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  FOUNDER_SPOTS,
  PROFESSIONAL_ACTIVITY_DAYS,
  SEARCH_RADIUS_KM,
  PROFESSIONAL_CATEGORIES,
  PROFESSIONAL_COMPLETENESS_LABEL,
  PROFESSIONAL_ENTITY_LABEL,
  PROFESSIONAL_FUNNEL_LABEL,
  PROFESSIONAL_PLAN_LABEL,
  PROFESSIONAL_STATUS_LABEL,
  sharePercentLabel,
  type AdminProfessionalStats,
} from "@professionisti/shared";
import { Button, Text, YStack, brand } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/lib/AuthContext";
import { AdminCard, AdminPageHeader, CountingFromNote, errorMessage, formatAdminDate } from "@/components/admin/adminUi";
import { StatsBarChart } from "@/components/StatsBarChart";
import { SkeletonTableRows } from "@/components/Skeleton";
import { SignupFunnelCard } from "@/components/admin/SignupFunnelCard";

/**
 * "negli ultimi 90 giorni", oppure "dal lancio (20 ott 2026)" quando il
 * lancio è più recente: prima del lancio non si conta (docs/CHANGELOG.md §395).
 */
function periodText(days: number, countingFrom: string | null, label = `negli ultimi ${days} giorni`): string {
  if (countingFrom && Date.now() - new Date(countingFrom).getTime() < days * 24 * 60 * 60 * 1000) return `dal lancio (${formatAdminDate(countingFrom)})`;
  return label;
}

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

      {/* Non segue i filtri: l'iscrizione passo per passo di tutti i professionisti. */}
      {token ? <SignupFunnelCard token={token} /> : null}
    </YStack>
  );
}

function StatsBody({ data, filters, scope }: { data: AdminProfessionalStats; filters: Filters; scope: string }) {
  const visible = data.byStatus.find((s) => s.key === "VISIBLE")?.count ?? 0;
  const founders = data.byPlan.find((p) => p.key === "FOUNDER")?.count ?? 0;
  const excluded = [
    data.excluded.deleted ? `${data.excluded.deleted} ${data.excluded.deleted === 1 ? "eliminato" : "eliminati"}` : null,
    data.excluded.demo ? `${data.excluded.demo} ${data.excluded.demo === 1 ? "profilo dimostrativo" : "profili dimostrativi"}` : null,
    data.excluded.test ? `${data.excluded.test} account di prova` : null,
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
      <CountingFromNote countingFrom={data.countingFrom} launchDate={data.launchDate} />
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
          <span className="admin-kpi-value">{data.active30d}</span>
          <span className="admin-kpi-label">Attivi {periodText(30, data.countingFrom)} · {sharePercentLabel(data.active30d, data.total)}</span>
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
          <BarSection
            title="A che punto dell'iscrizione"
            note="Ogni riga conta chi ha già fatto quel passo: il calo tra due righe è chi si è fermato prima."
            total={data.total}
            rows={data.funnel.map((f) => ({ key: f.key, label: PROFESSIONAL_FUNNEL_LABEL[f.key], count: f.count }))}
          />
          <BarSection
            title="Profili completi"
            total={data.total}
            rows={data.completeness.map((c) => ({ key: c.key, label: PROFESSIONAL_COMPLETENESS_LABEL[c.key], count: c.count }))}
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

      <SearchCard searches={data.searches} withCategory={Boolean(filters.category)} countingFrom={data.countingFrom} />
      <SearchZonesCard rows={data.searches.byCategoryCity} />
      <CoverageCard rows={data.coverage} countingFrom={data.countingFrom} />
      <CategoryActivityCard rows={data.byCategoryActivity} countingFrom={data.countingFrom} />
      <ChurnCard rows={data.churnByMonth} countingFrom={data.countingFrom} />

      {excluded.length ? <Text color={brand.grafite70} fontSize={13}>Non contati: {excluded.join(", ")}.</Text> : null}
    </YStack>
  );
}

function CardTitle({ title, note }: { title: string; note: string }) {
  return (
    <YStack gap="$1">
      <Text fontFamily="$heading" fontWeight="800" fontSize="$6" color={brand.grafite}>
        {title}
      </Text>
      <Text color={brand.grafite70} fontSize={13}>
        {note}
      </Text>
    </YStack>
  );
}

const cityName = (city: string) => city || "Senza città";

/**
 * Cosa cercano sul sito (scelta di Luca, docs/CHANGELOG.md §370): quante
 * ricerche, quante senza nessuno vicino, per nome o solo città, e le città
 * più cercate. Solo numeri, mai chi cerca né il testo scritto.
 */
function SearchCard({ searches, withCategory, countingFrom }: { searches: AdminProfessionalStats["searches"]; withCategory: boolean; countingFrom: string | null }) {
  const since = periodText(PROFESSIONAL_ACTIVITY_DAYS, countingFrom);
  const figures = [
    { key: "total", value: String(searches.total), label: "Ricerche" },
    { key: "empty", value: `${searches.empty} · ${sharePercentLabel(searches.empty, searches.total)}`, label: "Senza nessun professionista vicino", alert: searches.empty > 0 },
    ...(withCategory
      ? []
      : [
          { key: "text", value: String(searches.withText), label: "Con un nome o una parola scritta" },
          { key: "city", value: String(searches.cityOnly), label: "Solo per città, senza lavoro" },
        ]),
  ];
  return (
    <AdminCard>
      <CardTitle
        title="Cosa cercano"
        note={`Ricerche sul sito ${since}. "Vicino" vuol dire entro ${SEARCH_RADIUS_KM} km. Una pagina ricaricata conta di nuovo.`}
      />
      {searches.total === 0 ? (
        <Text color={brand.grafite70}>Nessuna ricerca {since}.</Text>
      ) : (
        <>
          <div className="admin-figures">
            {figures.map((f) => (
              <div key={f.key} className={f.alert ? "admin-figure is-alert" : "admin-figure"}>
                <span className="admin-figure-value">{f.value}</span>
                <span className="admin-figure-label">{f.label}</span>
              </div>
            ))}
          </div>
          <Text fontFamily="$heading" fontWeight="700" fontSize="$5" color={brand.grafite}>
            Città più cercate
          </Text>
          <ul className="admin-bars">
            {searches.byCity.map((row) => (
              <li key={row.city}>
                <div className="admin-bars-head">
                  <span className="admin-bars-label">
                    {cityName(row.city)}
                    {row.empty > 0 ? <span className="admin-bars-alert">{row.empty} senza nessuno vicino</span> : null}
                  </span>
                  <span className="admin-bars-value">
                    <strong>{row.searches}</strong> · {sharePercentLabel(row.searches, searches.total)}
                  </span>
                </div>
                <div className="admin-bars-track" aria-hidden="true">
                  <div className="admin-bars-fill" style={{ width: `${Math.min(100, (row.searches / searches.total) * 100)}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </AdminCard>
  );
}

/** Lavoro e città cercati: dove c'è domanda e quanti professionisti ci sono. */
function SearchZonesCard({ rows }: { rows: AdminProfessionalStats["searches"]["byCategoryCity"] }) {
  if (rows.length === 0) return null;
  return (
    <AdminCard>
      <CardTitle
        title="Lavori cercati per città"
        note="Professionisti visibili con sede in quella città. Prima le ricerche rimaste senza nessuno vicino."
      />
      <div className="admin-table-wrap">
        <table className="admin-table admin-table-numbers">
          <thead>
            <tr>
              <th>Lavoro</th>
              <th>Città</th>
              <th>Ricerche</th>
              <th>Senza nessuno vicino</th>
              <th>Professionisti</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={`${row.categorySlug}-${row.city}`}>
                <td className="admin-cell-main">{row.categoryLabel}</td>
                <td data-label="Città">{cityName(row.city)}</td>
                <td data-label="Ricerche">{row.searches}</td>
                <td data-label="Senza nessuno vicino" className={row.empty > 0 ? "is-alert" : undefined}>
                  {row.empty} · {sharePercentLabel(row.empty, row.searches)}
                </td>
                <td data-label="Professionisti" className={row.professionals === 0 ? "is-alert" : undefined}>
                  {row.professionals}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminCard>
  );
}

/** Dove mancano professionisti: richieste senza preventivo per categoria e città. */
function CoverageCard({ rows, countingFrom }: { rows: AdminProfessionalStats["coverage"]; countingFrom: string | null }) {
  const since = periodText(PROFESSIONAL_ACTIVITY_DAYS, countingFrom, `degli ultimi ${PROFESSIONAL_ACTIVITY_DAYS} giorni`);
  return (
    <AdminCard>
      <CardTitle
        title="Copertura per categoria e città"
        note={`Richieste ${since} e professionisti visibili con sede in quella città. Prima le zone con più richieste senza preventivo.`}
      />
      {rows.length === 0 ? (
        <Text color={brand.grafite70}>Nessuna richiesta {periodText(PROFESSIONAL_ACTIVITY_DAYS, countingFrom)}.</Text>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table admin-table-numbers">
            <thead>
              <tr>
                <th>Categoria</th>
                <th>Città</th>
                <th>Richieste</th>
                <th>Senza preventivo</th>
                <th>Professionisti</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={`${row.categorySlug}-${row.city}`}>
                  <td className="admin-cell-main">{row.categoryLabel}</td>
                  <td data-label="Città">{row.city}</td>
                  <td data-label="Richieste">{row.requests}</td>
                  <td data-label="Senza preventivo" className={row.unanswered > 0 ? "is-alert" : undefined}>
                    {row.unanswered} · {sharePercentLabel(row.unanswered, row.requests)}
                  </td>
                  <td data-label="Professionisti" className={row.professionals === 0 ? "is-alert" : undefined}>
                    {row.professionals}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AdminCard>
  );
}

/** Minuti in parole brevi: "25 min", "3 ore", "2 giorni". */
function durationLabel(minutes: number | null): string {
  if (minutes === null) return "—";
  if (minutes < 60) return `${minutes} min`;
  if (minutes < 48 * 60) return `${Math.round(minutes / 60)} ore`;
  return `${Math.round(minutes / (24 * 60))} giorni`;
}

function CategoryActivityCard({ rows, countingFrom }: { rows: AdminProfessionalStats["byCategoryActivity"]; countingFrom: string | null }) {
  const since = periodText(PROFESSIONAL_ACTIVITY_DAYS, countingFrom, `ultimi ${PROFESSIONAL_ACTIVITY_DAYS} giorni`);
  return (
    <AdminCard>
      <CardTitle
        title="Risposte, preventivi e recensioni per categoria"
        note={`${since.charAt(0).toUpperCase()}${since.slice(1)}, per categoria della richiesta. Risposta: preventivo, messaggio o rifiuto. Prima risposta: tempo a metà classifica. Recensioni e voto ${countingFrom ? "dal lancio" : "da sempre"}.`}
      />
      {rows.length === 0 ? (
        <Text color={brand.grafite70}>Ancora nessuna richiesta, preventivo o recensione.</Text>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table admin-table-numbers">
            <thead>
              <tr>
                <th>Categoria</th>
                <th>Richieste ricevute</th>
                <th>Con risposta</th>
                <th>Prima risposta</th>
                <th>Preventivi</th>
                <th>Accettati</th>
                <th>Recensioni</th>
                <th>Voto medio</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.slug}>
                  <td className="admin-cell-main">{row.label}</td>
                  <td data-label="Richieste ricevute">{row.leads}</td>
                  <td data-label="Con risposta">{row.leads ? `${row.answered} · ${sharePercentLabel(row.answered, row.leads)}` : "—"}</td>
                  <td data-label="Prima risposta">{durationLabel(row.medianMinutesToAnswer)}</td>
                  <td data-label="Preventivi">{row.quotes}</td>
                  <td data-label="Accettati">{row.quotes ? `${row.accepted} · ${sharePercentLabel(row.accepted, row.quotes)}` : "—"}</td>
                  <td data-label="Recensioni">{row.reviews}</td>
                  <td data-label="Voto medio">{row.avgRating === null ? "—" : row.avgRating.toLocaleString("it-IT", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AdminCard>
  );
}

const monthLabel = (key: string) => {
  const [year, month] = key.split("-").map(Number) as [number, number];
  return new Intl.DateTimeFormat("it-IT", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(year, month - 1, 1)));
};

function ChurnCard({ rows, countingFrom }: { rows: AdminProfessionalStats["churnByMonth"]; countingFrom: string | null }) {
  const totals = rows.reduce((sum, r) => ({ deleted: sum.deleted + r.deleted, paused: sum.paused + r.paused, canceled: sum.canceled + r.canceled }), {
    deleted: 0,
    paused: 0,
    canceled: 0,
  });
  return (
    <AdminCard>
      <CardTitle
        title={`Abbandoni ${periodText(365, countingFrom, "negli ultimi 12 mesi")}`}
        note="In pausa: solo chi lo è ancora. Abbonamenti annullati: nel mese dell'annullamento, anche se restano attivi fino alla scadenza."
      />
      <div className="admin-table-wrap">
        <table className="admin-table admin-table-numbers">
          <thead>
            <tr>
              <th>Mese</th>
              <th>Account eliminati</th>
              <th>Messi in pausa</th>
              <th>Abbonamenti annullati</th>
            </tr>
          </thead>
          <tbody>
            {[...rows].reverse().map((row) => (
              <tr key={row.key}>
                <td className="admin-cell-main">{monthLabel(row.key)}</td>
                <td data-label="Eliminati">{row.deleted}</td>
                <td data-label="In pausa">{row.paused}</td>
                <td data-label="Annullati">{row.canceled}</td>
              </tr>
            ))}
            <tr className="admin-table-total">
              <td className="admin-cell-main">Totale</td>
              <td data-label="Eliminati">{totals.deleted}</td>
              <td data-label="In pausa">{totals.paused}</td>
              <td data-label="Annullati">{totals.canceled}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </AdminCard>
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
