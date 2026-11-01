"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ADMIN_QUEUE_GROUP_LABEL, ADMIN_QUEUE_KINDS, adminCan, formatEurCents, type AdminQueue, type AdminQueueGroup, type AdminQueueItem } from "@professionisti/shared";
import { Text, XStack, YStack, brand } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/lib/AuthContext";
import { useAdminOverview } from "@/components/admin/AdminOverviewContext";
import { AdminPill, errorMessage, formatAdminDate } from "@/components/admin/adminUi";
import { SiteAdviceList } from "@/components/admin/SiteAdviceList";
import { SkeletonTableRows } from "@/components/Skeleton";
import type { SiteAdvice } from "@professionisti/shared";

const HOUR_MS = 60 * 60 * 1000;

/** "Scaduto da 2 ore", "Oggi alle 18:00", "Lun 2 nov, fra 3 giorni". */
function dueLabel(dueAt: string, now: number): { text: string; late: boolean } {
  const due = new Date(dueAt).getTime();
  const diff = due - now;
  if (diff < 0) {
    const hours = Math.round(-diff / HOUR_MS);
    return { text: hours < 1 ? "Scaduto ora" : hours < 48 ? `Scaduto da ${hours} ${hours === 1 ? "ora" : "ore"}` : `Scaduto da ${Math.round(hours / 24)} giorni`, late: true };
  }
  const day = new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", weekday: "short", day: "numeric", month: "short" }).format(new Date(due));
  const time = new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", hour: "2-digit", minute: "2-digit" }).format(new Date(due));
  const days = Math.floor(diff / (24 * HOUR_MS));
  if (diff < 24 * HOUR_MS) return { text: `Entro le ${time}`, late: diff < 6 * HOUR_MS };
  return { text: `${day.charAt(0).toUpperCase()}${day.slice(1)}, fra ${days} ${days === 1 ? "giorno" : "giorni"}`, late: false };
}

function ageLabel(iso: string, now: number): string {
  const hours = Math.round((now - new Date(iso).getTime()) / HOUR_MS);
  if (hours < 1) return "da poco";
  if (hours < 48) return `da ${hours} ${hours === 1 ? "ora" : "ore"}`;
  return `da ${Math.round(hours / 24)} giorni`;
}

/**
 * Da fare (riordino dell'Admin, docs/changelog/2026-10-30-admin-riordino.md):
 * tutti i casi che aspettano una decisione in una sola coda, prima i pericoli
 * e quello che scade prima. "Prendo io" dice agli altri admin chi se ne
 * occupa. Grafici e numeri sono passati in Numeri → Andamento e consigli.
 */
export default function AdminDaFarePage() {
  return (
    <Suspense fallback={null}>
      <DaFare />
    </Suspense>
  );
}

function DaFare() {
  const { token, user } = useAuth();
  const { refresh } = useAdminOverview();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const group = (searchParams.get("tipo") as AdminQueueGroup | null) ?? null;
  const who = searchParams.get("chi");
  const [queue, setQueue] = useState<AdminQueue | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [now] = useState(() => Date.now());
  const isSuper = adminCan(user?.adminRoles ?? [], "SUPER");
  // Consigli della settimana (docs/CHANGELOG.md §372): in cima per il super admin.
  const [advice, setAdvice] = useState<SiteAdvice[] | null>(null);

  const load = useCallback(() => {
    if (!token) return;
    apiClient
      .adminQueue(token)
      .then((q) => {
        setQueue(q);
        setError(null);
      })
      .catch((err) => setError(errorMessage(err)));
  }, [token]);
  useEffect(load, [load]);
  useEffect(() => {
    if (!token || !isSuper) return;
    apiClient
      .adminSiteStats(token)
      .then((stats) => setAdvice(stats.advice))
      .catch(() => setAdvice(null));
  }, [token, isSuper]);

  // Filtri nell'indirizzo: un link porta alla stessa vista.
  function setFilter(key: "tipo" | "chi", value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  async function claim(item: AdminQueueItem, take: boolean) {
    if (!token) return;
    setPendingKey(item.key);
    try {
      await apiClient.adminClaimCase(token, item.key, take);
      load();
      refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPendingKey(null);
    }
  }

  const all = queue?.items ?? [];
  const groups = [...new Set(all.map((i) => ADMIN_QUEUE_KINDS[i.kind].group))];
  const items = all.filter(
    (i) =>
      (!group || ADMIN_QUEUE_KINDS[i.kind].group === group) &&
      (who !== "mie" || i.claimedBy?.id === user?.id) &&
      (who !== "libere" || !i.claimedBy),
  );

  return (
    <YStack gap="$5">
      <Text color={brand.grafite70} marginTop={-8}>
        Tutto quello che aspetta una decisione, prima i pericoli e quello che scade prima.
      </Text>

      {isSuper && advice && advice.length > 0 ? (
        <YStack gap="$2">
          <Text tag="h2" margin={0} fontFamily="$heading" fontWeight="800" fontSize="$6" color={brand.grafite}>
            Cosa fare questa settimana
          </Text>
          <SiteAdviceList advice={advice} limit={1} />
          <Link href="/admin/andamento" style={{ fontSize: 14 }}>
            Tutti i consigli e i numeri
          </Link>
        </YStack>
      ) : null}

      <YStack gap="$3">
        <XStack gap="$2" flexWrap="wrap" alignItems="center">
          <select className="admin-input" aria-label="Tipo di caso" value={group ?? ""} onChange={(e) => setFilter("tipo", e.target.value)}>
            <option value="">Tutti i tipi ({all.length})</option>
            {groups.map((g) => (
              <option key={g} value={g}>
                {ADMIN_QUEUE_GROUP_LABEL[g]} ({all.filter((i) => ADMIN_QUEUE_KINDS[i.kind].group === g).length})
              </option>
            ))}
          </select>
          <select className="admin-input" aria-label="Chi se ne occupa" value={who ?? ""} onChange={(e) => setFilter("chi", e.target.value)}>
            <option value="">Di tutti</option>
            <option value="mie">Presi da me</option>
            <option value="libere">Non presi da nessuno</option>
          </select>
        </XStack>

        {error ? <Text color={brand.urgenza}>{error}</Text> : null}
        {queue === null && !error ? (
          <div className="admin-table-wrap">
            <SkeletonTableRows rows={5} cols={4} />
          </div>
        ) : null}
        {queue && items.length === 0 ? <Text color={brand.grafite70}>{all.length === 0 ? "Niente da gestire: tutto in ordine." : "Nessun caso con questi filtri."}</Text> : null}
        {items.length > 0 ? (
          <div className="admin-table-wrap">
            <table className="admin-table admin-queue">
              <thead>
                <tr>
                  <th scope="col">Scadenza</th>
                  <th scope="col">Caso</th>
                  <th scope="col">Chi</th>
                  <th scope="col">Stato</th>
                  <th scope="col">
                    <span className="sr-only">Azioni</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const due = item.dueAt ? dueLabel(item.dueAt, now) : null;
                  const mine = item.claimedBy?.id === user?.id;
                  return (
                    <tr key={item.key}>
                      <td>
                        {due ? <span className={`admin-queue-due${due.late ? " is-late" : ""}`}>{due.text}</span> : <span className="admin-queue-due">Aperto {ageLabel(item.createdAt, now)}</span>}
                        {item.dueNote ? <div style={{ fontSize: 13, color: brand.grafite70 }}>{item.dueNote}</div> : null}
                      </td>
                      <td>
                        <Text fontWeight="700" color={brand.grafite}>
                          {item.title}
                          {item.amountEurCents ? ` · ${formatEurCents(item.amountEurCents)}` : ""}
                        </Text>
                        {item.detail ? <div style={{ fontSize: 13, color: brand.grafite70 }}>{item.detail}</div> : null}
                      </td>
                      <td>{item.who ?? "—"}</td>
                      <td>
                        <YStack gap={4} alignItems="flex-start">
                          <AdminPill tone={item.danger ? "danger" : item.status === "Da decidere" || item.status === "Prove da mandare" ? "warn" : "neutral"}>{item.status}</AdminPill>
                          {item.claimedBy ? (
                            <Text fontSize={13} color={brand.grafite70}>
                              {mine ? "Preso da te" : `Preso da ${item.claimedBy.name}`}
                            </Text>
                          ) : null}
                        </YStack>
                      </td>
                      <td>
                        <div className="admin-queue-actions">
                          {mine ? (
                            <button type="button" className="admin-link-button" disabled={pendingKey === item.key} onClick={() => claim(item, false)}>
                              Lascia
                            </button>
                          ) : (
                            <button type="button" className="admin-link-button" disabled={pendingKey === item.key} onClick={() => claim(item, true)}>
                              Prendo io
                            </button>
                          )}
                          <Link href={item.href} className="admin-link-button is-primary" aria-label={`Apri: ${item.title}${item.who ? `, ${item.who}` : ""}`}>
                            Apri
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </YStack>

      {queue && queue.watching.length > 0 ? (
        <YStack gap="$2">
          <Text tag="h2" margin={0} fontFamily="$heading" fontWeight="800" fontSize="$6" color={brand.grafite}>
            Da guardare, senza decisione
          </Text>
          <Text fontSize={14} color={brand.grafite70}>
            Problemi ancora in chat tra cliente e professionista: i soldi restano fermi finché non si chiudono.
          </Text>
          <ul className="admin-watch">
            {queue.watching.map((w) => (
              <li key={w.key}>
                <Link href={w.href}>{w.who ?? w.title}</Link>
                <span> · in chat {ageLabel(w.since, now)} · aperto il {formatAdminDate(w.since)}</span>
              </li>
            ))}
          </ul>
        </YStack>
      ) : null}
    </YStack>
  );
}
