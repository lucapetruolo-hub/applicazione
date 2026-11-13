"use client";

import { useCallback, useEffect, useState } from "react";
import { SITE_CHECK_LABEL, SITE_DEADLINE_NOTICE_DAYS, type SiteHealth } from "@professionisti/shared";
import { Button, Text, XStack, YStack, brand } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/lib/AuthContext";
import { AdminPageHeader, AdminPill, TechNote, errorMessage, formatAdminDate } from "@/components/admin/adminUi";
import { SkeletonTableRows } from "@/components/Skeleton";

/**
 * Impostazioni → Scadenze e controlli (docs/changelog/2026-11-13-admin-scadenze-controlli.md):
 * le date da non dimenticare (il database gratuito che scade, una chiave da
 * rinnovare) e l'esito del controllo che il sito fa da solo ogni notte. Le
 * scadenze vicine e i problemi compaiono anche in cima a Da fare.
 */
export default function AdminSitoPage() {
  const { token } = useAuth();
  const [data, setData] = useState<SiteHealth | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!token) return;
    apiClient
      .adminSiteHealth(token)
      .then(setData)
      .catch((err) => setError(errorMessage(err)));
  }, [token]);
  useEffect(load, [load]);

  async function run(key: string, action: () => Promise<unknown>) {
    setBusy(key);
    setError(null);
    try {
      await action();
      load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  const open = data?.deadlines.filter((d) => !d.doneAt) ?? [];
  const done = data?.deadlines.filter((d) => d.doneAt) ?? [];

  return (
    <YStack gap="5">
      <AdminPageHeader
        title="Scadenze e controlli"
        description={`Le date da non dimenticare e il controllo che il sito fa da solo ogni notte. Una scadenza compare in Da fare ${SITE_DEADLINE_NOTICE_DAYS} giorni prima.`}
      />
      {error ? <Text color={brand.urgenza}>{error}</Text> : null}

      <YStack gap="2">
        <Text fontFamily="heading" fontWeight="700" fontSize="5" color={brand.grafite}>
          Controllo della notte
        </Text>
        {!data && !error ? (
          <SkeletonTableRows rows={4} cols={2} />
        ) : data && data.checks.length === 0 ? (
          <Text color={brand.grafite70}>Il primo controllo si fa stanotte alle 4.</Text>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Cosa si controlla</th>
                  <th>Com&apos;è andata</th>
                </tr>
              </thead>
              <tbody>
                {data?.checks.map((c) => (
                  <tr key={c.id}>
                    <td data-label="Cosa si controlla">{SITE_CHECK_LABEL[c.key] ?? c.key}</td>
                    <td data-label="Com'è andata">
                      <YStack gap="1">
                        <XStack gap="2" alignItems="center" flexWrap="wrap">
                          <AdminPill tone={c.ok ? "ok" : "danger"}>{c.ok ? "Va bene" : "Non va"}</AdminPill>
                          <Text fontSize={13} color={brand.grafite70}>
                            {c.ok ? `Controllato il ${formatAdminDate(c.checkedAt, true)}` : `Non va dal ${formatAdminDate(c.failingSince, true)}`}
                          </Text>
                        </XStack>
                        {c.problem ? <Text fontSize={14}>{c.problem}</Text> : null}
                        {c.techNote ? <TechNote>{c.techNote}</TechNote> : null}
                      </YStack>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </YStack>

      <YStack gap="2">
        <Text fontFamily="heading" fontWeight="700" fontSize="5" color={brand.grafite}>
          Scadenze
        </Text>
        {data && open.length === 0 ? <Text color={brand.grafite70}>Nessuna scadenza da fare.</Text> : null}
        {open.length ? (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Entro il</th>
                  <th>Cosa fare</th>
                  <th>
                    <span className="sr-only">Azioni</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {open.map((d) => (
                  <tr key={d.id}>
                    <td data-label="Entro il">{formatAdminDate(d.dueAt)}</td>
                    <td data-label="Cosa fare">
                      <YStack gap="1">
                        <Text fontWeight="600">{d.title}</Text>
                        {d.note ? <Text fontSize={14} color={brand.grafite70}>{d.note}</Text> : null}
                      </YStack>
                    </td>
                    <td data-label="Azioni">
                      <XStack gap="2" flexWrap="wrap">
                        <Button size="2" height={36} disabled={busy !== null} onPress={() => token && run(`done:${d.id}`, () => apiClient.adminSiteDeadlineDone(token, d.id))}>
                          {busy === `done:${d.id}` ? "…" : "Fatto"}
                        </Button>
                        <Button variant="ghost" size="2" height={36} disabled={busy !== null} onPress={() => token && run(`del:${d.id}`, () => apiClient.adminDeleteSiteDeadline(token, d.id))}>
                          Togli
                        </Button>
                      </XStack>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        <YStack gap="2" marginTop="2">
            <Text fontWeight="600">Aggiungi una scadenza</Text>
            <XStack gap="2" flexWrap="wrap">
              <input className="admin-input" aria-label="Cosa scade" placeholder="Cosa scade (es. il dominio del sito)" value={title} onChange={(e) => setTitle(e.target.value)} style={{ flex: 2, minWidth: 220 }} />
              <input className="admin-input" type="date" aria-label="Entro il" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
            </XStack>
            <input className="admin-input" aria-label="Cosa fare" placeholder="Cosa fare (se vuoi)" value={note} onChange={(e) => setNote(e.target.value)} />
            <XStack>
              <Button
                size="3"
                height={40}
                disabled={busy !== null || title.trim().length < 4 || !dueAt}
                onPress={() =>
                  token &&
                  run("add", async () => {
                    await apiClient.adminAddSiteDeadline(token, { title, dueAt, note: note || undefined });
                    setTitle("");
                    setDueAt("");
                    setNote("");
                  })
                }
              >
                {busy === "add" ? "…" : "Aggiungi la scadenza"}
              </Button>
            </XStack>
        </YStack>

        {done.length ? (
          <details className="admin-more">
            <summary>Già fatte ({done.length})</summary>
            <div className="admin-more-body">
              {done.map((d) => (
                <Text key={d.id} fontSize={14} color={brand.grafite70}>
                  {formatAdminDate(d.dueAt)} · {d.title} · fatta il {formatAdminDate(d.doneAt)}
                </Text>
              ))}
            </div>
          </details>
        ) : null}
      </YStack>
    </YStack>
  );
}
