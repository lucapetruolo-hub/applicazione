"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import {
  CHURN_KIND_LABEL,
  CHURN_REASON_LABEL,
  CLIENT_FUNNEL_LABEL,
  GOOGLE_OPENING_TARGETS,
  GUIDE_GREEN_SHARE,
  GUIDE_QUOTE_HOURS,
  GUIDE_RED_SHARE,
  MIN_CASES_FOR_PERCENT,
  MIN_CASES_PER_ROW,
  MISSING_SERVICE_MIN_PROFESSIONALS,
  REQUEST_STEP_LABEL,
  SERVICE_GAP_MAX_OFFERED,
  SERVICE_GAP_MIN_SEARCHES,
  SITE_COUNTERS_RETENTION_MONTHS,
  SUBMIT_FAILURE_KIND_LABEL,
  SUBMIT_FORM_LABEL,
  TRAFFIC_SOURCE_LABELS,
  adminCan,
  ratioLabel,
  type AdminSiteStats,
  type GuideCellStatus,
  type SignupSourceKey,
} from "@professionisti/shared";
import { Text, YStack, brand } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/lib/AuthContext";
import { chooseCountingDisabled, isCountingDisabled } from "@/lib/siteCounts";
import {
  AdminCard,
  AdminPageHeader,
  errorMessage,
  formatAdminDate,
} from "@/components/admin/adminUi";
import { SiteAdviceList } from "@/components/admin/SiteAdviceList";
import { StatsBarChart } from "@/components/StatsBarChart";
import { SkeletonTableRows } from "@/components/Skeleton";

/**
 * Andamento del sito (richiesta di Luca, docs/CHANGELOG.md §372): in cima
 * cosa fare questa settimana, già deciso dai numeri; sotto i numeri dietro
 * i consigli, per chi vuole controllare. Solo conteggi, mai chi è la persona.
 */
export default function AdminAndamentoPage() {
  const { token, user } = useAuth();
  const [data, setData] = useState<AdminSiteStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!token) return;
    apiClient
      .adminSiteStats(token)
      .then((stats) => {
        setData(stats);
        setError(null);
      })
      .catch((err) => setError(errorMessage(err)));
  }, [token]);

  useEffect(load, [load]);

  const isSuper = adminCan(user?.adminRoles ?? [], "SUPER");
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [adviceError, setAdviceError] = useState<string | null>(null);

  // "Fatto" e "Riapri": la scheda sparisce o torna subito, poi si ricaricano i numeri.
  async function changeDone(key: string, action: () => Promise<void>) {
    setPendingKey(key);
    setAdviceError(null);
    try {
      await action();
      load();
    } catch (err) {
      setAdviceError(errorMessage(err));
    } finally {
      setPendingKey(null);
    }
  }

  return (
    <YStack gap="$5">
      <AdminPageHeader
        title="Andamento del sito"
        description="Cosa fare questa settimana, già deciso dai numeri. Ogni lunedì mattina arriva anche per email."
      />

      {error ? <Text color={brand.urgenza}>{error}</Text> : null}

      {data === null && !error ? <SkeletonTableRows rows={5} cols={2} /> : null}

      {data ? (
        <>
          <section aria-labelledby="advice-title">
            <YStack gap="$3">
              <Text
                id="advice-title"
                tag="h2"
                fontFamily="$heading"
                fontWeight="800"
                fontSize="$7"
                color={brand.grafite}
              >
                Cosa fare questa settimana
              </Text>
              <SiteAdviceList
                advice={data.advice}
                pendingKey={pendingKey}
                onDone={
                  isSuper && token
                    ? (item) => changeDone(item.key, () => apiClient.adminMarkSiteAdviceDone(token, { key: item.key, title: item.title }))
                    : undefined
                }
              />
              {adviceError ? <Text color={brand.urgenza}>{adviceError}</Text> : null}
              {data.doneAdvice.length ? (
                <div className="site-done">
                  <Text fontWeight="700" color={brand.grafite}>
                    Fatti di recente
                  </Text>
                  <Text color={brand.grafite70} fontSize={13}>
                    Tornano dopo 14 giorni solo se i numeri dicono ancora la stessa cosa.
                  </Text>
                  <ul className="site-notes">
                    {data.doneAdvice.map((d) => (
                      <li key={d.key}>
                        <span>{d.title}</span>
                        <time dateTime={d.doneAt}>fatto il {formatAdminDate(d.doneAt)}</time>
                        {isSuper && token ? (
                          <button
                            type="button"
                            className="notif-link site-note-delete"
                            disabled={pendingKey === d.key}
                            onClick={() => changeDone(d.key, () => apiClient.adminUndoSiteAdviceDone(token, d.key))}
                            aria-label={`Riapri: ${d.title}`}
                          >
                            Riapri
                          </button>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {!isSuper ? (
                <Text color={brand.grafite70} fontSize={13}>
                  Alcune azioni (come eliminare un account di prova) le può fare
                  solo un super admin.
                </Text>
              ) : null}
            </YStack>
          </section>

          <YStack gap="$1" marginTop="$4">
            <Text
              tag="h2"
              fontFamily="$heading"
              fontWeight="800"
              fontSize="$7"
              color={brand.grafite}
            >
              I numeri dietro i consigli
            </Text>
            <Text color={brand.grafite70} fontSize={14}>
              Ultimi {data.windowDays} giorni, salvo dove scritto. Sotto{" "}
              {MIN_CASES_FOR_PERCENT} casi si scrive &quot;7 su 9&quot; invece
              della percentuale; le righe con meno di {MIN_CASES_PER_ROW} casi
              sono messe insieme. Admin, robot e browser con &quot;Non
              contare&quot; non sono contati.
            </Text>
          </YStack>

          <GuideCard data={data} />
          <CellsCard data={data} />
          <FunnelCard data={data} />
          <StepsCard data={data} />
          <ClientCohortsCard data={data} />
          <ProfessionalCohortsCard data={data} />
          <FailuresCard data={data} />
          <UnknownJobsCard data={data} />
          <PopularServicesCard data={data} />
          <SourcesCard data={data} />
          <ChurnReasonsCard data={data} />
          <LaunchCard data={data} />
          <ReconciliationCard data={data} />
          <NotesCard data={data} token={token} onChanged={load} />
          <CountingCard />
        </>
      ) : null}
    </YStack>
  );
}

function CardTitle({ title, note }: { title: string; note?: string }) {
  return (
    <YStack gap="$1">
      <Text
        tag="h3"
        fontFamily="$heading"
        fontWeight="800"
        fontSize="$6"
        color={brand.grafite}
      >
        {title}
      </Text>
      {note ? (
        <Text color={brand.grafite70} fontSize={13}>
          {note}
        </Text>
      ) : null}
    </YStack>
  );
}

const weekLabel = (weekStart: string) => {
  const [year, month, day] = weekStart.split("-").map(Number) as [
    number,
    number,
    number,
  ];
  return new Intl.DateTimeFormat("it-IT", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
};

const addDays = (day: string, days: number) => {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

/** Il numero guida: richieste con almeno un preventivo entro 24 ore. */
function GuideCard({ data }: { data: AdminSiteStats }) {
  const points = data.guideWeekly.map((w) => ({
    key: w.weekStart,
    label: weekLabel(w.weekStart),
    value: w.withQuote,
  }));
  const first = data.guideWeekly[0]?.weekStart;
  const last = data.guideWeekly.at(-1)?.weekStart;
  // Note che cadono nelle settimane del grafico.
  const notes =
    first && last
      ? data.notes.filter((n) => n.day >= first && n.day <= addDays(last, 6))
      : [];
  return (
    <AdminCard>
      <CardTitle
        title="Il numero guida"
        note={`Richieste che hanno ricevuto almeno un preventivo entro ${GUIDE_QUOTE_HOURS} ore. Non contano quelle ancora nelle prime ${GUIDE_QUOTE_HOURS} ore e quelle eliminate dal cliente prima.`}
      />
      <div className="admin-figures">
        <div className="admin-figure">
          <span className="admin-figure-value">
            {data.guide.requests === 0
              ? "—"
              : ratioLabel(data.guide.withQuote, data.guide.requests)}
          </span>
          <span className="admin-figure-label">
            Con un preventivo entro {GUIDE_QUOTE_HOURS} ore
          </span>
        </div>
        <div className="admin-figure">
          <span className="admin-figure-value">{data.guide.requests}</span>
          <span className="admin-figure-label">Richieste contate</span>
        </div>
      </div>
      <Text color={brand.grafite70} fontSize={13}>
        Va bene da {Math.round(GUIDE_GREEN_SHARE * 100)}% in su; sotto{" "}
        {Math.round(GUIDE_RED_SHARE * 100)}% i clienti restano senza risposta.
      </Text>
      <Text
        fontFamily="$heading"
        fontWeight="700"
        fontSize="$5"
        color={brand.grafite}
        marginTop="$2"
      >
        Richieste con un preventivo entro {GUIDE_QUOTE_HOURS} ore, per settimana
      </Text>
      <StatsBarChart
        points={points}
        formatValue={(v) => String(v)}
        ariaLabel="Richieste con un preventivo entro 24 ore, per settimana"
      />
      {notes.length ? (
        <ul
          className="site-notes"
          aria-label="Cosa è successo in queste settimane"
        >
          {notes.map((n) => (
            <li key={`${n.day}-${n.text}`}>
              <time dateTime={n.day}>
                {formatAdminDate(`${n.day}T12:00:00Z`)}
              </time>
              <span>{n.text}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </AdminCard>
  );
}

const STATUS_LABEL: Record<GuideCellStatus, string> = {
  GREEN: "Va bene",
  YELLOW: "Da tenere d'occhio",
  RED: "Clienti senza risposta",
  NO_PROFESSIONALS: "Nessun professionista",
};

/** Lavoro × città: dove c'è domanda e nessuno risponde. */
function CellsCard({ data }: { data: AdminSiteStats }) {
  return (
    <AdminCard>
      <CardTitle
        title="Lavori e città"
        note="Prima le caselle dove i clienti restano senza risposta. Ricerche a vuoto: nessun professionista vicino. Professionisti: visibili con sede in quella città."
      />
      {data.cells.length === 0 && !data.otherCells ? (
        <Text color={brand.grafite70}>
          Ancora nessuna richiesta o ricerca in questo periodo.
        </Text>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table admin-table-numbers">
            <thead>
              <tr>
                <th>Lavoro e città</th>
                <th>Com&apos;è</th>
                <th>Richieste</th>
                <th>Con preventivo in {GUIDE_QUOTE_HOURS} ore</th>
                <th>Ricerche a vuoto</th>
                <th>Professionisti</th>
              </tr>
            </thead>
            <tbody>
              {data.cells.map((cell) => (
                <tr key={`${cell.categorySlug}-${cell.city}`}>
                  <td className="admin-cell-main">
                    {cell.categoryLabel} a {cell.city || "città non indicata"}
                  </td>
                  <td data-label="Com'è">
                    <span
                      className={`site-status is-${cell.status.toLowerCase()}`}
                    >
                      {STATUS_LABEL[cell.status]}
                    </span>
                  </td>
                  <td data-label="Richieste">{cell.requests}</td>
                  <td data-label={`Con preventivo in ${GUIDE_QUOTE_HOURS} ore`}>
                    {cell.requests
                      ? ratioLabel(cell.withQuote, cell.requests)
                      : "—"}
                  </td>
                  <td
                    data-label="Ricerche a vuoto"
                    className={cell.emptySearches > 0 ? "is-alert" : undefined}
                  >
                    {cell.emptySearches}
                  </td>
                  <td
                    data-label="Professionisti"
                    className={
                      cell.professionals === 0 ? "is-alert" : undefined
                    }
                  >
                    {cell.professionals}
                  </td>
                </tr>
              ))}
              {data.otherCells ? (
                <tr className="admin-table-total">
                  <td className="admin-cell-main">
                    {data.otherCells.cells === 1
                      ? "1 altra casella"
                      : `Altre ${data.otherCells.cells} caselle`}{" "}
                    con pochi casi
                  </td>
                  <td data-label="Com'è">—</td>
                  <td data-label="Richieste">{data.otherCells.requests}</td>
                  <td data-label={`Con preventivo in ${GUIDE_QUOTE_HOURS} ore`}>
                    {data.otherCells.requests
                      ? ratioLabel(
                          data.otherCells.withQuote,
                          data.otherCells.requests,
                        )
                      : "—"}
                  </td>
                  <td data-label="Ricerche a vuoto">—</td>
                  <td data-label="Professionisti">—</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      )}
    </AdminCard>
  );
}

type BarRow = { key: string; label: string; count: number; note?: string };

/**
 * Barre orizzontali. `total`: quota sul totale; `steps`: un percorso, la
 * barra è lunga rispetto al passo più alto e la quota è sul passo prima.
 */
function Bars({
  rows,
  total,
  steps,
}: {
  rows: BarRow[];
  total: number;
  steps?: boolean;
}) {
  const max = Math.max(0, ...rows.map((r) => r.count));
  return (
    <ul className="admin-bars">
      {rows.map((row, i) => {
        const base = steps ? (rows[i - 1]?.count ?? 0) : total;
        const width = steps
          ? max > 0
            ? (row.count / max) * 100
            : 0
          : total > 0
            ? Math.min(100, (row.count / total) * 100)
            : 0;
        return (
          <li key={row.key} className={row.count === 0 ? "is-zero" : undefined}>
            <div className="admin-bars-head">
              <span className="admin-bars-label">
                {row.label}
                {row.note ? (
                  <span className="admin-bars-alert">{row.note}</span>
                ) : null}
              </span>
              <span className="admin-bars-value">
                <strong>{row.count}</strong>
                {base > 0 && row.count <= base
                  ? ` · ${ratioLabel(row.count, base)}${steps ? " del passo prima" : ""}`
                  : null}
              </span>
            </div>
            <div className="admin-bars-track" aria-hidden="true">
              <div className="admin-bars-fill" style={{ width: `${width}%` }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** "Persi qui: 12": il calo più grande tra un passo e il successivo. */
function withDrops(
  rows: { key: string; label: string; count: number }[],
): BarRow[] {
  let biggest = -1;
  let biggestAt = -1;
  rows.forEach((row, i) => {
    const prev = rows[i - 1];
    if (!prev) return;
    const drop = prev.count - row.count;
    if (drop > biggest) {
      biggest = drop;
      biggestAt = i;
    }
  });
  return rows.map((row, i) => ({
    ...row,
    note:
      i === biggestAt && biggest >= MIN_CASES_PER_ROW
        ? `Qui si perdono di più: ${biggest}`
        : undefined,
  }));
}

function FunnelCard({ data }: { data: AdminSiteStats }) {
  const rows = withDrops(
    data.clientFunnel.map((f) => ({
      key: f.key,
      label: CLIENT_FUNNEL_LABEL[f.key],
      count: f.count,
    })),
  );
  return (
    <AdminCard>
      <CardTitle
        title="Il percorso del cliente"
        note="Dalla ricerca alla recensione. Ogni riga è il passo dopo: il calo tra due righe è chi si è fermato."
      />
      <Bars rows={rows} total={0} steps />
    </AdminCard>
  );
}

function StepsCard({ data }: { data: AdminSiteStats }) {
  const rows = withDrops(
    data.requestSteps.map((s) => ({
      key: s.key,
      label: REQUEST_STEP_LABEL[s.key],
      count: s.count,
    })),
  );
  // Le richieste partite dalla pagina di un professionista, a parte: dicono se i profili convincono.
  const fromProfile = withDrops(
    data.requestSteps.map((s) => ({
      key: `profilo-${s.key}`,
      label: REQUEST_STEP_LABEL[s.key],
      count: s.fromProfile,
    })),
  );
  const profileViews = data.clientFunnel.find((f) => f.key === "PROFILE_VIEWS")?.count ?? 0;
  const startedFromProfile = data.requestSteps.find((s) => s.key === "LAVORO")?.fromProfile ?? 0;
  return (
    <AdminCard>
      <CardTitle
        title="I passi della richiesta"
        note="Quante volte è stato raggiunto ogni passo del modulo di richiesta. Chi era già entrato salta l'accesso: per questo quel passo può essere più basso."
      />
      <Bars rows={rows} total={0} steps />
      <Text fontFamily="$heading" fontWeight="700" fontSize="$5" color={brand.grafite} marginTop="$3">
        Di queste, dalla pagina di un professionista
      </Text>
      <Text color={brand.grafite70} fontSize={13}>
        {profileViews > 0
          ? `Profili aperti ${profileViews} volte: ${startedFromProfile} richieste iniziate da lì (${ratioLabel(startedFromProfile, profileViews)}).`
          : "Nessun profilo aperto in questo periodo."}
      </Text>
      <Bars rows={fromProfile} total={0} steps />
    </AdminCard>
  );
}

function ClientCohortsCard({ data }: { data: AdminSiteStats }) {
  return (
    <AdminCard>
      <CardTitle
        title="Clienti per settimana della prima richiesta"
        note="Per ogni settimana, cosa è successo dopo ai clienti che hanno fatto la prima richiesta in quella settimana. Tornati: hanno fatto un'altra richiesta."
      />
      {data.clientCohorts.length === 0 ? (
        <Text color={brand.grafite70}>Ancora nessun cliente.</Text>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table admin-table-numbers">
            <thead>
              <tr>
                <th>Settimana del</th>
                <th>Clienti</th>
                <th>Con preventivo</th>
                <th>Hanno accettato</th>
                <th>Recensione</th>
                <th>Tornati</th>
              </tr>
            </thead>
            <tbody>
              {[...data.clientCohorts].reverse().map((c) => (
                <tr key={c.weekStart}>
                  <td className="admin-cell-main">{weekLabel(c.weekStart)}</td>
                  <td data-label="Clienti">{c.clients}</td>
                  <td data-label="Con preventivo">
                    {c.clients ? ratioLabel(c.withQuote, c.clients) : "—"}
                  </td>
                  <td data-label="Hanno accettato">
                    {c.clients ? ratioLabel(c.accepted, c.clients) : "—"}
                  </td>
                  <td data-label="Recensione">
                    {c.clients ? ratioLabel(c.reviewed, c.clients) : "—"}
                  </td>
                  <td data-label="Tornati">
                    {c.clients ? ratioLabel(c.returned, c.clients) : "—"}
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

function ProfessionalCohortsCard({ data }: { data: AdminSiteStats }) {
  return (
    <AdminCard>
      <CardTitle
        title="Professionisti per settimana di iscrizione"
        note="Fino a dove sono arrivati quelli iscritti in quella settimana. Attivi: hanno usato il sito negli ultimi 30 giorni."
      />
      {data.professionalCohorts.length === 0 ? (
        <Text color={brand.grafite70}>
          Ancora nessun professionista iscritto.
        </Text>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table admin-table-numbers">
            <thead>
              <tr>
                <th>Settimana del</th>
                <th>Iscritti</th>
                <th>Dati fiscali</th>
                <th>Identità</th>
                <th>Primo preventivo</th>
                <th>Attivi</th>
              </tr>
            </thead>
            <tbody>
              {[...data.professionalCohorts].reverse().map((c) => (
                <tr key={c.weekStart}>
                  <td className="admin-cell-main">{weekLabel(c.weekStart)}</td>
                  <td data-label="Iscritti">{c.registered}</td>
                  <td data-label="Dati fiscali">
                    {c.registered ? ratioLabel(c.fiscal, c.registered) : "—"}
                  </td>
                  <td data-label="Identità">
                    {c.registered ? ratioLabel(c.identity, c.registered) : "—"}
                  </td>
                  <td data-label="Primo preventivo">
                    {c.registered
                      ? ratioLabel(c.firstQuote, c.registered)
                      : "—"}
                  </td>
                  <td data-label="Attivi">
                    {c.registered ? ratioLabel(c.active, c.registered) : "—"}
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

function FailuresCard({ data }: { data: AdminSiteStats }) {
  const rows = data.submitFailures.filter((f) => f.count > 0);
  return (
    <AdminCard>
      <CardTitle
        title="Invii non riusciti"
        note="Quando qualcuno preme Invia e non va. Errore del sito: è colpa nostra, va sistemato subito."
      />
      {rows.length === 0 ? (
        <Text color={brand.grafite70}>Nessun invio non riuscito.</Text>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table admin-table-numbers">
            <thead>
              <tr>
                <th>Modulo</th>
                <th>Cosa è successo</th>
                <th>Volte</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((f) => (
                <tr key={`${f.form}-${f.kind}`}>
                  <td className="admin-cell-main">
                    {SUBMIT_FORM_LABEL[f.form]}
                  </td>
                  <td data-label="Cosa è successo">
                    {SUBMIT_FAILURE_KIND_LABEL[f.kind]}
                  </td>
                  <td
                    data-label="Volte"
                    className={f.kind === "SERVER" ? "is-alert" : undefined}
                  >
                    {f.count}
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

function UnknownJobsCard({ data }: { data: AdminSiteStats }) {
  return (
    <AdminCard>
      <CardTitle
        title="Lavori cercati che non esistono sul sito"
        note="Parole cercate in almeno 3 giorni diversi negli ultimi 90 giorni senza trovare né un lavoro né un professionista. Dicono quale lavoro aggiungere."
      />
      {data.unknownJobs.length === 0 ? (
        <Text color={brand.grafite70}>
          Ancora nessuna parola cercata abbastanza spesso.
        </Text>
      ) : (
        <Bars
          rows={data.unknownJobs.map((j) => ({
            key: j.term,
            label: `«${j.term}» · in ${j.days} giorni`,
            count: j.searches,
          }))}
          total={0}
        />
      )}
    </AdminCard>
  );
}

function PopularServicesCard({ data }: { data: AdminSiteStats }) {
  return (
    <AdminCard>
      <CardTitle
        title="Prestazioni più cercate"
        note="Ricerche scritte negli ultimi 90 giorni che corrispondono a una prestazione suggerita, per lavoro, e quanti professionisti di quel lavoro la offrono. Si conta solo il nome della prestazione, mai quello che ha scritto il cliente."
      />
      {data.popularServices.length === 0 ? (
        <Text color={brand.grafite70}>Ancora nessuna ricerca di una prestazione.</Text>
      ) : (
        data.popularServices.slice(0, 6).map((category) => (
          <YStack key={category.categorySlug} gap="$1">
            <Text fontFamily="$heading" fontWeight="700" fontSize="$5" color={brand.grafite} marginTop="$2">
              {category.categoryLabel}
            </Text>
            <Bars
              rows={category.services.slice(0, 5).map((s) => ({
                key: s.service,
                label: `${s.service} · la offrono ${s.offeredBy}`,
                count: s.searches,
                note: s.searches >= SERVICE_GAP_MIN_SEARCHES && s.offeredBy <= SERVICE_GAP_MAX_OFFERED ? "pochi la offrono" : undefined,
              }))}
              total={category.services.reduce((sum, s) => sum + s.searches, 0)}
            />
          </YStack>
        ))
      )}
      <Text fontFamily="$heading" fontWeight="700" fontSize="$5" color={brand.grafite} marginTop="$3">
        Scritte a mano dai professionisti, non suggerite
      </Text>
      <Text color={brand.grafite70} fontSize={13}>
        {`Prestazioni scritte da almeno ${MISSING_SERVICE_MIN_PROFESSIONALS} professionisti che il sito non propone: aggiungerle con + in "Prestazioni per mestiere" le rende un clic e somma bene i prezzi medi.`}
      </Text>
      {data.missingServices.length === 0 ? (
        <Text color={brand.grafite70}>Nessuna per ora.</Text>
      ) : (
        <Bars
          rows={data.missingServices.map((m) => ({
            key: `${m.categorySlug}-${m.name}`,
            label: `${m.name} · ${m.categoryLabel}`,
            count: m.professionals,
          }))}
          total={0}
        />
      )}
    </AdminCard>
  );
}

const SOURCE_LABEL: Record<SignupSourceKey, string> = {
  ...TRAFFIC_SOURCE_LABELS,
  INVITE: "Profilo creato al telefono",
  unknown: "Non si sa",
};

function SourcesCard({ data }: { data: AdminSiteStats }) {
  const total = data.signupSources.reduce((sum, s) => sum + s.count, 0);
  return (
    <AdminCard>
      <CardTitle
        title="Da dove arrivano i professionisti"
        note="Iscritti negli ultimi 90 giorni, per come sono arrivati sul sito la prima volta."
      />
      {total === 0 ? (
        <Text color={brand.grafite70}>
          Nessun professionista iscritto negli ultimi 90 giorni.
        </Text>
      ) : (
        <Bars
          rows={data.signupSources.map((s) => ({
            key: s.source,
            label: SOURCE_LABEL[s.source],
            count: s.count,
          }))}
          total={total}
        />
      )}
    </AdminCard>
  );
}

function ChurnReasonsCard({ data }: { data: AdminSiteStats }) {
  const rows = data.churnReasons.filter((r) => r.count > 0);
  const total = rows.reduce((sum, r) => sum + r.count, 0);
  return (
    <AdminCard>
      <CardTitle
        title="Perché se ne vanno"
        note="Motivo scelto (facoltativo) da chi ha eliminato l'account o annullato l'abbonamento negli ultimi 90 giorni."
      />
      {rows.length === 0 ? (
        <Text color={brand.grafite70}>Nessun motivo scelto finora.</Text>
      ) : (
        <Bars
          rows={rows.map((r) => ({
            key: `${r.kind}-${r.reason}`,
            label: `${CHURN_REASON_LABEL[r.reason]} · ${CHURN_KIND_LABEL[r.kind]}`,
            count: r.count,
          }))}
          total={total}
        />
      )}
    </AdminCard>
  );
}

function LaunchCard({ data }: { data: AdminSiteStats }) {
  const steps = [
    {
      key: "pro",
      label: "Professionisti visibili",
      value: data.launch.visibleProfessionals,
      target: GOOGLE_OPENING_TARGETS.visibleProfessionals,
    },
    {
      key: "clients",
      label: "Clienti che hanno chiesto un preventivo",
      value: data.launch.clientsWithRequest,
      target: GOOGLE_OPENING_TARGETS.clientsWithRequest,
    },
    {
      key: "jobs",
      label: "Preventivi accettati",
      value: data.launch.acceptedJobs,
      target: GOOGLE_OPENING_TARGETS.acceptedJobs,
    },
    {
      key: "paid",
      label: "Lavori pagati online",
      value: data.launch.paidOnline,
      target: GOOGLE_OPENING_TARGETS.paidOnline,
    },
    {
      key: "weeks",
      label: "Settimane di fila col numero guida verde",
      value: data.launch.greenWeeks,
      target: GOOGLE_OPENING_TARGETS.greenWeeks,
    },
  ];
  return (
    <AdminCard>
      <CardTitle
        title="Prima di aprire il sito a Google"
        note="Le tappe da raggiungere con i professionisti chiamati uno per uno, prima di farsi trovare da tutti."
      />
      <ul className="site-progress">
        {steps.map((s) => (
          <li key={s.key}>
            <span>{s.label}</span>
            <span className={s.value >= s.target ? "is-done" : undefined}>
              {s.value} su {s.target}
              {s.value >= s.target ? " · fatto" : ""}
            </span>
          </li>
        ))}
      </ul>
    </AdminCard>
  );
}

function ReconciliationCard({ data }: { data: AdminSiteStats }) {
  const r = data.reconciliation;
  return (
    <AdminCard>
      <CardTitle
        title="Controllo dei conteggi"
        note={`Richieste inviate contate dal browser contro quelle salvate davvero, ultimi ${r.days} giorni. Il browser ne conta un po' meno (admin, chi ha spento il conteggio, blocchi della pubblicità).`}
      />
      <Text color={r.ok ? brand.grafite : brand.urgenza} fontWeight="700">
        {r.counted} contate, {r.saved} salvate ·{" "}
        {r.ok ? "i conti tornano" : "i conti non tornano, da controllare"}
      </Text>
    </AdminCard>
  );
}

const todayRome = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome" }).format(
    new Date(),
  );

function NotesCard({
  data,
  token,
  onChanged,
}: {
  data: AdminSiteStats;
  token: string | null;
  onChanged: () => void;
}) {
  const [day, setDay] = useState(todayRome);
  const [text, setText] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add(event: FormEvent) {
    event.preventDefault();
    if (!token) return;
    setPending(true);
    setError(null);
    try {
      await apiClient.adminAddSiteNote(token, { day, text });
      setText("");
      onChanged();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  }

  async function remove(id: string) {
    if (!token) return;
    try {
      await apiClient.adminDeleteSiteNote(token, id);
      onChanged();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <AdminCard>
      <CardTitle
        title="Note sul grafico"
        note="Cose successe che cambiano i numeri: lancio, nuovi prezzi, una campagna, un giro di telefonate. Il lancio e i cambi di prezzo ci sono già."
      />
      {data.notes.length ? (
        <ul className="site-notes">
          {[...data.notes].reverse().map((n) => (
            <li key={`${n.id ?? "auto"}-${n.day}-${n.text}`}>
              <time dateTime={n.day}>
                {formatAdminDate(`${n.day}T12:00:00Z`)}
              </time>
              <span>{n.text}</span>
              {n.id ? (
                <button
                  type="button"
                  className="notif-link site-note-delete"
                  onClick={() => remove(n.id as string)}
                  aria-label={`Elimina la nota «${n.text}»`}
                >
                  Elimina
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      <form className="site-note-form" onSubmit={add}>
        <input
          type="date"
          className="admin-input"
          aria-label="Giorno"
          value={day}
          max={todayRome()}
          onChange={(e) => setDay(e.target.value)}
          required
        />
        <input
          className="admin-input"
          aria-label="Cosa è successo"
          placeholder="Es. giro di telefonate agli idraulici di Latina"
          maxLength={140}
          value={text}
          onChange={(e) => setText(e.target.value)}
          required
        />
        <button
          type="submit"
          className="admin-link-button"
          disabled={pending || text.trim().length < 2}
        >
          {pending ? "Attendi..." : "Aggiungi la nota"}
        </button>
      </form>
      {error ? <Text color={brand.urgenza}>{error}</Text> : null}
    </AdminCard>
  );
}

/** "Non contare questo browser": per chi prova il sito senza falsare i numeri. */
function CountingCard() {
  // Mostrata solo dopo il caricamento dei numeri nel browser: il cookie si legge subito.
  const [disabled, setDisabled] = useState(isCountingDisabled);
  return (
    <AdminCard>
      <CardTitle
        title="Questo browser"
        note={`Le visite da questo browser ${disabled ? "non sono contate" : "sono contate"}. Gli admin non vengono contati da soli; i conteggi si tengono ${SITE_COUNTERS_RETENTION_MONTHS} mesi.`}
      />
      <div className="notif-switch-row">
        <div>
          <strong>Non contare questo browser</strong>
          <small>
            Acceso: ricerche, richieste e visite fatte da qui non finiscono nei
            numeri.
          </small>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={disabled}
          aria-label="Non contare questo browser"
          className={`notif-switch${disabled ? " is-on" : ""}`}
          onClick={() => {
            chooseCountingDisabled(!disabled);
            setDisabled(!disabled);
          }}
        >
          <span />
        </button>
      </div>
      <Text color={brand.grafite70} fontSize={13}>
        Per eliminare un account di prova:{" "}
        <Link href="/admin/utenti">Utenti</Link>, apri l&apos;account e premi
        &quot;Elimina account di prova&quot;.
      </Text>
    </AdminCard>
  );
}
