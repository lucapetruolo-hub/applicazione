"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  BOARD_USE_LABEL,
  MIN_CASES_FOR_PERCENT,
  OUT_OF_SERVICE_LABELS,
  type BoardAdminCounts,
  type BoardSpeedCounts,
  waitingInviteHref,
  waitingTradeAd,
  type MostRequestedTrade,
  type ProblemSafety,
  type ProblemTakeoverAdmin,
  type WaitingRequestAdminGroup,
  type WaitingRequestState,
  type WaitingRequestsAdmin,
} from "@professionisti/shared";
import { Button, Text, XStack, YStack, brand } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/lib/AuthContext";
import { AdminPageHeader, AdminPill, AdminTabs, errorMessage, formatAdminDate } from "@/components/admin/adminUi";
import { SkeletonTableRows } from "@/components/Skeleton";
import { SITE_URL } from "@/lib/siteUrl";

/**
 * "Richieste in attesa" (docs/changelog/2026-11-17-richieste-in-attesa.md,
 * decisioni di Luca del 17/11/2026): richieste complete per un mestiere che
 * nessuno fa ancora vicino al cliente. Arrivano da sole a chi lo fa appena si
 * iscrive: qui si vede per mestiere e zona chi reclutare, con un annuncio
 * anonimo da copiare. Mai i contatti del cliente.
 *
 * Sotto "Di prima" le vecchie richieste "Prendete in carico la richiesta"
 * (docs/CHANGELOG.md §392), da seguire a mano finché non sono fatte.
 */
const SAFETY_LABEL: Record<ProblemSafety, string> = {
  gas: "Possibile pericolo: gas",
  monossido: "Possibile pericolo: monossido",
  elettrico: "Possibile pericolo: corrente",
  "acqua-elettrico": "Possibile pericolo: acqua e corrente",
};

type PageTab = "attesa" | "arrivate" | "chiuse" | "prima";

const STATE_OF_TAB: Record<Exclude<PageTab, "prima">, WaitingRequestState> = { attesa: "WAITING", arrivate: "SENT", chiuse: "CLOSED" };

const daysSince = (iso: string) => Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / (24 * 60 * 60 * 1000)));
const daysText = (days: number) => (days === 0 ? "da oggi" : days === 1 ? "da 1 giorno" : `da ${days} giorni`);

export default function AdminRichiesteInAttesaPage() {
  const { token } = useAuth();
  const [tab, setTab] = useState<PageTab>("attesa");
  const [data, setData] = useState<WaitingRequestsAdmin | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    apiClient
      .adminWaitingRequests(token)
      .then(setData)
      .catch((err) => setError(errorMessage(err)));
  }, [token]);

  const count = (state: WaitingRequestState) => data?.rows.filter((row) => row.state === state).length ?? 0;
  const rows = tab === "prima" || !data ? [] : data.rows.filter((row) => row.state === STATE_OF_TAB[tab]).reverse();

  return (
    <YStack>
      <AdminPageHeader
        title="Richieste in attesa"
        description="Lavori che vicino al cliente non fa ancora nessuno. La richiesta arriva da sola a chi lo fa appena si iscrive: qui vedi chi cercare e dove."
      />
      <AdminTabs
        tabs={[
          { key: "attesa", label: data ? `In attesa (${count("WAITING")})` : "In attesa" },
          { key: "arrivate", label: data ? `Arrivate (${count("SENT")})` : "Arrivate" },
          { key: "chiuse", label: data ? `Chiuse (${count("CLOSED")})` : "Chiuse" },
          { key: "prima", label: "Di prima" },
        ]}
        value={tab}
        onChange={setTab}
      />
      {data?.board ? <BoardCounts counts={data.board} /> : null}
      {data && data.mostRequested.length > 0 ? <MostRequested trades={data.mostRequested} /> : null}
      {tab === "prima" ? (
        <OldTakeovers />
      ) : error ? (
        <Text color={brand.urgenza}>{error}</Text>
      ) : !data ? (
        <SkeletonTableRows rows={4} cols={5} />
      ) : (
        <YStack gap="4">
          {tab === "attesa" && data.groups.length > 0 ? <WaitingGroups groups={data.groups} /> : null}
          {rows.length === 0 ? (
            <Text color={brand.grafite70} marginTop="3">
              {tab === "attesa" ? "Nessuna richiesta in attesa." : tab === "arrivate" ? "Nessuna richiesta arrivata a un professionista." : "Nessuna richiesta chiusa."}
            </Text>
          ) : (
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Mestiere</th>
                    <th>Descrizione</th>
                    <th>Zona</th>
                    <th>Inviata</th>
                    <th>Stato</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id}>
                      <td>{row.trade}</td>
                      <td style={{ maxWidth: 380 }}>{row.description}</td>
                      <td>{row.city || row.zone}</td>
                      <td>{formatAdminDate(row.createdAt)}</td>
                      <td>
                        {row.state === "WAITING" ? (
                          <YStack gap={4} alignItems="flex-start">
                            <AdminPill tone="warn">In attesa {daysText(daysSince(row.createdAt))}</AdminPill>
                            {row.stillNeededAskedAt ? (
                              <Text fontSize={13} color={brand.grafite70}>
                                Chiesto «Ti serve ancora?»
                              </Text>
                            ) : null}
                          </YStack>
                        ) : row.state === "SENT" ? (
                          <AdminPill tone="ok">{row.recipients === 1 ? "Arrivata a 1 professionista" : `Arrivata a ${row.recipients} professionisti`}</AdminPill>
                        ) : (
                          <AdminPill>{row.recipients > 0 ? "Chiusa" : "Chiusa senza nessuno"}</AdminPill>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </YStack>
      )}
    </YStack>
  );
}

/**
 * Misure della bacheca "Lavori cercati" (docs/changelog/2026-11-18-bacheca-cliente.md):
 * solo numeri, per capire se la bacheca porta preventivi.
 */
function BoardCounts({ counts }: { counts: BoardAdminCounts }) {
  const items = [
    { label: "In bacheca adesso", value: counts.listed },
    { label: "Risposte con «Rispondi»", value: counts.replies },
    { label: "Preventivi da quelle risposte", value: counts.quotes },
    { label: "Risposte su richieste inoltrate", value: counts.repliesAfterForward },
    { label: "Preventivi su richieste inoltrate", value: counts.quotesAfterForward },
    { label: "Tenute da parte", value: counts.claimsPending },
    { label: "Aspettano «Avvisami»", value: counts.alertsPending },
    { label: "Tolte dal cliente", value: counts.optedOut },
  ];
  return (
    <YStack gap="2" marginBottom="4">
      <Text fontSize={13} fontWeight="800" color={brand.grafite70} textTransform="uppercase">
        Lavori cercati
      </Text>
      <div className="waiting-groups">
        {items.map((item) => (
          <div key={item.label} className="waiting-group">
            <strong>{item.value}</strong>
            <span>{item.label}</span>
          </div>
        ))}
      </div>
      <Text fontSize={13} color={brand.grafite70}>
        Risposte, preventivi e richieste tolte: ultimi 90 giorni. Gli altri numeri sono di oggi.
      </Text>
      <BoardMeasures counts={counts} />
    </YStack>
  );
}

/** "7 su 9" sotto i 30 casi, altrimenti la percentuale (una percentuale su pochi casi inganna). */
function shareText(part: number, total: number): string {
  if (total === 0) return "Nessuna richiesta ancora";
  return total < MIN_CASES_FOR_PERCENT ? `${part} su ${total}` : `${Math.round((part / total) * 100)}%`;
}

function speedText(speed: BoardSpeedCounts): string {
  const hours = speed.medianHours === null ? "" : ` · primo preventivo in ${speed.medianHours} ore (a metà)`;
  return `${shareText(speed.withQuote, speed.requests)}${hours}`;
}

/**
 * Misure della bacheca (docs/changelog/2026-11-20-misure-lavori-cercati.md):
 * il numero che conta, gli iscritti partiti da lì, l'uso della pagina e
 * dove mancano professionisti. Solo numeri, dal lancio.
 */
function BoardMeasures({ counts }: { counts: BoardAdminCounts }) {
  return (
    <YStack gap="3" marginTop="3">
      <Text fontSize={13} fontWeight="800" color={brand.grafite70} textTransform="uppercase">
        Preventivo entro 7 giorni
      </Text>
      <div className="waiting-groups">
        <div className="waiting-group">
          <strong>{speedText(counts.speedOnBoard)}</strong>
          <span>Richieste entrate in Lavori cercati</span>
        </div>
        <div className="waiting-group">
          <strong>{speedText(counts.speedOutside)}</strong>
          <span>Richieste rimaste fuori. Si conta da quando sarebbero entrate.</span>
        </div>
        <div className="waiting-group">
          <strong>
            {counts.signupsFromBoard} · {counts.signupsFromBoardQuoted} con un preventivo
          </strong>
          <span>Iscritti da Lavori cercati. Con un preventivo: entro 30 giorni.</span>
        </div>
      </div>
      <Text fontSize={13} fontWeight="800" color={brand.grafite70} textTransform="uppercase">
        Dove mancano professionisti
      </Text>
      {counts.uncovered.length === 0 ? (
        <Text fontSize={14} color={brand.grafite70}>
          Oggi c'è sempre qualcuno che può rispondere entro 100 km.
        </Text>
      ) : (
        <div className="waiting-groups">
          {counts.uncovered.map((row) => (
            <div key={`${row.province}|${row.trade}`} className="waiting-group">
              <strong>
                {row.tradeLabel} · {row.provinceName}
              </strong>
              <span>{row.count === 1 ? "1 richiesta" : `${row.count} richieste`} senza nessuno entro 100 km</span>
            </div>
          ))}
        </div>
      )}
      <Text fontSize={13} fontWeight="800" color={brand.grafite70} textTransform="uppercase">
        Uso della pagina
      </Text>
      <div className="waiting-groups">
        {counts.use.map((row) => (
          <div key={row.action} className="waiting-group">
            <strong>{row.count}</strong>
            <span>{BOARD_USE_LABEL[row.action]}</span>
          </div>
        ))}
      </div>
      <Text fontSize={13} color={brand.grafite70}>
        Ultimi 90 giorni, dal lancio e senza account di prova. Non contano i browser con «Non contare questo browser».
      </Text>
    </YStack>
  );
}

/**
 * Contatore dei mestieri più richiesti (decisione di Luca del 17/11/2026,
 * docs/changelog/2026-11-17-mestiere-piu-vicino.md): richieste in attesa e di
 * prima insieme, degli ultimi 90 giorni, con le zone accanto
 * (docs/changelog/2026-11-17-invito-precompilato.md).
 */
function MostRequested({ trades }: { trades: MostRequestedTrade[] }) {
  const [all, setAll] = useState(false);
  const shown = all ? trades : trades.slice(0, 8);
  return (
    <YStack gap="2" marginBottom="4">
      <Text fontSize={13} fontWeight="800" color={brand.grafite70} textTransform="uppercase">
        Più richiesti
      </Text>
      <ol className="most-requested">
        {shown.map((item) => (
          <li key={item.trade}>
            <span>
              {item.trade}
              {item.zones.length > 0 ? (
                <small className="most-requested-zones">
                  {item.zones.slice(0, 4).map((z) => `${z.zone} ${z.requests}`).join(" · ")}
                  {item.zones.length > 4 ? ` · altre ${item.zones.length - 4}` : ""}
                </small>
              ) : null}
            </span>
            <strong>{item.requests}</strong>
          </li>
        ))}
      </ol>
      <XStack gap="3" alignItems="center" flexWrap="wrap">
        <Text fontSize={13} color={brand.grafite70}>
          Richieste degli ultimi 90 giorni, nuove e di prima.
        </Text>
        {trades.length > 8 ? (
          <button type="button" className="waiting-group-link most-requested-more" onClick={() => setAll((v) => !v)}>
            {all ? "Mostra meno" : `Mostra tutti (${trades.length})`}
          </button>
        ) : null}
      </XStack>
    </YStack>
  );
}

/** Chi cercare: mestiere e zona con più richieste in attesa, con l'annuncio anonimo da copiare. */
function WaitingGroups({ groups }: { groups: WaitingRequestAdminGroup[] }) {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = async (group: WaitingRequestAdminGroup) => {
    const key = `${group.trade}|${group.zone}`;
    try {
      await navigator.clipboard.writeText(waitingTradeAd(group, SITE_URL));
      setCopied(key);
    } catch {
      setCopied(null);
    }
  };
  return (
    <YStack gap="2">
      <Text fontSize={13} fontWeight="800" color={brand.grafite70} textTransform="uppercase">
        Chi cercare
      </Text>
      <div className="waiting-groups">
        {groups.map((group) => {
          const key = `${group.trade}|${group.zone}`;
          return (
            <div key={key} className="waiting-group">
              <strong>{group.trade}</strong>
              <span>{group.zone}</span>
              <span>
                {group.waiting === 1 ? "1 richiesta" : `${group.waiting} richieste`} · la più vecchia {daysText(daysSince(group.oldestCreatedAt))}
              </span>
              <XStack gap="2" flexWrap="wrap" marginTop="2">
                <Button size="2" variant="secondary" onPress={() => void copy(group)}>
                  {copied === key ? "Copiato" : "Copia annuncio"}
                </Button>
                <Link href={waitingInviteHref(group)} className="waiting-group-link">
                  Invita un professionista
                </Link>
              </XStack>
            </div>
          );
        })}
      </div>
      <Text fontSize={13} color={brand.grafite70}>
        L&apos;annuncio dice solo il mestiere, la zona e il numero. &quot;Invita un professionista&quot; apre il modulo già scritto, con città e mestiere. Così le richieste gli arrivano da sole.
      </Text>
    </YStack>
  );
}

function OldTakeovers() {
  const { token, user } = useAuth();
  const [tab, setTab] = useState<"aperte" | "fatte">("aperte");
  const [rows, setRows] = useState<ProblemTakeoverAdmin[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!token) return;
    apiClient
      .adminProblemTakeovers(token, tab === "fatte")
      .then(setRows)
      .catch((err) => setError(errorMessage(err)));
  }, [token, tab]);

  useEffect(load, [load]);

  const mark = async (id: string, done: boolean) => {
    if (!token) return;
    setBusy(id);
    setError(null);
    try {
      await apiClient.adminMarkProblemTakeover(token, id, done);
      load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  // "Prendo io" come in Da fare (misura "dopo" del riordino): stessa chiave del caso.
  const claim = async (id: string, take: boolean) => {
    if (!token) return;
    setBusy(id);
    setError(null);
    try {
      await apiClient.adminClaimCase(token, `PROBLEM_TAKEOVER:${id}`, take);
      load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  // In ordine di arrivo, la prima ricevuta in cima (decisione di Luca del
  // 17/11/2026): il pericolo resta segnato nella riga.
  const sorted = rows ? [...rows].sort((a, b) => a.createdAt.localeCompare(b.createdAt)) : rows;

  return (
    <YStack>
      <Text color={brand.grafite70} marginBottom="2">
        Sono richieste di prima, in ordine di arrivo. Il cliente ci chiedeva di trovare qualcuno. Contattalo e poi segna la richiesta come fatta.
      </Text>
      <AdminTabs
        tabs={[
          { key: "aperte", label: "Da seguire" },
          { key: "fatte", label: "Fatte" },
        ]}
        value={tab}
        onChange={(next) => {
          setRows(null);
          setTab(next);
        }}
      />
      {error ? <Text color={brand.urgenza}>{error}</Text> : null}
      {rows === null && !error ? (
        <SkeletonTableRows rows={4} cols={5} />
      ) : rows && rows.length === 0 ? (
        <Text color={brand.grafite70} marginTop="3">
          {tab === "aperte" ? "Nessuna richiesta da seguire." : "Nessuna richiesta fatta."}
        </Text>
      ) : rows ? (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>N.</th>
                <th>Lavoro</th>
                <th>Descrizione</th>
                <th>Città</th>
                <th>Cliente</th>
                <th>Inviata</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {(sorted ?? []).map((row, index) => (
                <tr key={row.id}>
                  <td>{index + 1}</td>
                  <td>
                    <YStack gap={4} alignItems="flex-start">
                      {row.safety ? <AdminPill tone="danger">{SAFETY_LABEL[row.safety]}</AdminPill> : null}
                      <Text fontSize={14}>
                        {row.outOfService
                          ? (OUT_OF_SERVICE_LABELS[row.outOfService as keyof typeof OUT_OF_SERVICE_LABELS] ?? row.outOfService)
                          : row.missingTrade
                            ? `Mestiere che non abbiamo: ${row.missingTrade}`
                            : row.likelyCategory
                            ? `Probabile: ${row.likelyCategory}`
                            : "Mestiere non riconosciuto"}
                      </Text>
                    </YStack>
                  </td>
                  <td style={{ maxWidth: 380 }}>{row.description}</td>
                  <td>{row.city ?? "—"}</td>
                  <td>
                    <YStack>
                      <Text fontSize={14}>{row.client.name ?? "—"}</Text>
                      {row.client.email ? (
                        <a
                          href={`mailto:${row.client.email}`}
                          style={{
                            color: brand.cianografiaScuro,
                            fontSize: 14,
                          }}
                        >
                          {row.client.email}
                        </a>
                      ) : null}
                      {row.client.phone ? (
                        <a
                          href={`tel:${row.client.phone}`}
                          style={{
                            color: brand.cianografiaScuro,
                            fontSize: 14,
                          }}
                        >
                          {row.client.phone}
                        </a>
                      ) : null}
                    </YStack>
                  </td>
                  <td>{formatAdminDate(row.createdAt, true)}</td>
                  <td>
                    <YStack gap={6} alignItems="flex-start">
                      {tab === "aperte" && row.claimedBy ? (
                        <Text fontSize={13} color={brand.grafite70}>
                          {row.claimedBy.id === user?.id ? "Preso da te" : `Preso da ${row.claimedBy.name}`}
                        </Text>
                      ) : null}
                      <XStack gap="2" flexWrap="wrap">
                        {tab === "aperte" ? (
                          <Button size="2" variant="secondary" disabled={busy !== null} onPress={() => void claim(row.id, row.claimedBy?.id !== user?.id)}>
                            {row.claimedBy?.id === user?.id ? "Lascia" : "Prendo io"}
                          </Button>
                        ) : null}
                        <Button
                          size="2"
                          variant={tab === "aperte" ? "primary" : "secondary"}
                          disabled={busy !== null}
                          onPress={() => void mark(row.id, tab === "aperte")}
                        >
                          {tab === "aperte" ? "Fatto" : "Riapri"}
                        </Button>
                      </XStack>
                    </YStack>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </YStack>
  );
}
