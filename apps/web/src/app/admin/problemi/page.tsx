"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { AdminJobIssue } from "@professionisti/api-client";
import { JOB_ISSUE_LABEL, JOB_ISSUE_STATUS_LABEL } from "@professionisti/shared";
import { Button, Text, XStack, YStack, brand } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/lib/AuthContext";
import { AdminCard, AdminPageHeader, AdminPill, AdminTabs, errorMessage, formatAdminDate } from "@/components/admin/adminUi";
import { MediaPreview } from "@/components/MediaPreview";
import { SkeletonTableRows } from "@/components/Skeleton";

type View = "open" | "closed";

function Photos({ urls }: { urls: string[] }) {
  if (urls.length === 0) return null;
  return (
    <XStack gap="$2" flexWrap="wrap">
      {urls.map((url) => (
        <a key={url} href={url} target="_blank" rel="noreferrer" style={{ width: 84, height: 84, borderRadius: 8, overflow: "hidden", border: `1px solid ${brand.filetto}`, display: "block" }}>
          <MediaPreview url={url} />
        </a>
      ))}
    </XStack>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <YStack flex={1} minWidth={240} gap="$1">
      <Text fontWeight="700" color={brand.grafite}>
        {title}
      </Text>
      {children}
    </YStack>
  );
}

/** Decisione su una segnalazione: motivazione obbligatoria, accolta o respinta. */
function DecisionForm({ row, token, onDone }: { row: AdminJobIssue; token: string; onDone: () => void }) {
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState<"UPHELD" | "REJECTED" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function decide(decision: "UPHELD" | "REJECTED") {
    setError(null);
    if (note.trim().length < 3) {
      setError("Scrivi la motivazione: la leggono cliente e professionista.");
      return;
    }
    setSaving(decision);
    try {
      await apiClient.adminResolveJobIssue(token, row.issue.id, { decision, note: note.trim() });
      onDone();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(null);
    }
  }

  return (
    <YStack gap="$2" paddingTop="$2" borderTopWidth={1} borderTopColor={brand.filetto}>
      <Text fontWeight="700" color={brand.grafite}>
        Decisione
      </Text>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value.slice(0, 1000))}
        placeholder="Motivazione, visibile a cliente e professionista"
        aria-label="Motivazione della decisione"
        style={{ width: "100%", boxSizing: "border-box", minHeight: 70, padding: 10, borderRadius: 8, border: `1px solid ${brand.filetto}`, fontSize: 14, fontFamily: "inherit" }}
      />
      {row.issue.type === "NO_SHOW" ? (
        <Text fontSize={13} color={brand.grafite70}>
          Se la accogli, la mancata presentazione abbassa l&apos;affidabilità del professionista nell&apos;assegnazione delle richieste.
        </Text>
      ) : null}
      {error ? <Text color={brand.urgenza}>{error}</Text> : null}
      <XStack gap="$2" flexWrap="wrap">
        <Button variant="urgent" size="$3" height={40} disabled={saving !== null} opacity={saving ? 0.6 : 1} onPress={() => decide("UPHELD")}>
          {saving === "UPHELD" ? "Salvataggio..." : "Accogli la segnalazione"}
        </Button>
        <Button variant="secondary" size="$3" height={40} disabled={saving !== null} opacity={saving ? 0.6 : 1} onPress={() => decide("REJECTED")}>
          {saving === "REJECTED" ? "Salvataggio..." : "Respingi"}
        </Button>
      </XStack>
    </YStack>
  );
}

/**
 * Problemi segnalati dai clienti (docs/CHANGELOG.md §164): mancata
 * presentazione o lavoro non andato bene. Tutto ciò che serve a decidere
 * in una scheda: versione del cliente, risposta del professionista, note e
 * foto a lavoro terminato. Visibile a ogni ruolo admin.
 */
export default function AdminProblemiPage() {
  const { token } = useAuth();
  const [view, setView] = useState<View>("open");
  const [rows, setRows] = useState<AdminJobIssue[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (!token) return;
    setRows(null);
    apiClient
      .adminListJobIssues(token, view)
      .then(setRows)
      .catch((err) => setError(errorMessage(err)));
  }, [token, view, reload]);

  return (
    <YStack>
      <AdminPageHeader
        title="Problemi segnalati"
        description="Mancate presentazioni e lavori non andati bene segnalati dai clienti. Leggi le due versioni e decidi con una motivazione."
      />
      <AdminTabs
        tabs={[
          { key: "open", label: "Da decidere" },
          { key: "closed", label: "Decise" },
        ]}
        value={view}
        onChange={setView}
      />
      {error ? <Text color={brand.urgenza}>{error}</Text> : null}
      {rows === null && !error ? (
        <SkeletonTableRows rows={3} cols={4} />
      ) : rows && rows.length === 0 ? (
        <Text color={brand.grafite70}>{view === "open" ? "Nessuna segnalazione da decidere." : "Nessuna segnalazione decisa finora."}</Text>
      ) : rows && token ? (
        <YStack gap="$3">
          {rows.map((row) => (
            <AdminCard key={row.issue.id} highlight={row.issue.status === "OPEN"}>
              <XStack justifyContent="space-between" gap="$2" flexWrap="wrap">
                <YStack gap="$1" flex={1} minWidth={220}>
                  <Text fontWeight="800" color={brand.grafite}>
                    {JOB_ISSUE_LABEL[row.issue.type]}
                  </Text>
                  <Text fontSize={13} color={brand.grafite70}>
                    {row.categoryLabel ?? "Prenotazione dall'agenda"}
                    {row.city ? ` · ${row.city}` : ""} · appuntamento del {formatAdminDate(row.scheduledAt, true)}
                  </Text>
                  <Text fontSize={13} color={brand.grafite70}>
                    <Link href={`/admin/utenti/${row.professional.userId}`}>{row.professional.businessName}</Link>
                    {" · cliente "}
                    {row.client.accountDeleted ? "account eliminato" : <Link href={`/admin/utenti/${row.client.userId}`}>{row.client.name ?? "cliente"}</Link>}
                  </Text>
                </YStack>
                <YStack alignItems="flex-end" gap="$1">
                  <AdminPill tone={row.issue.status === "OPEN" ? "warn" : row.issue.status === "UPHELD" ? "danger" : "neutral"}>
                    {JOB_ISSUE_STATUS_LABEL[row.issue.status]}
                  </AdminPill>
                  <Text fontSize={13} color={brand.grafite70}>
                    Segnalata il {formatAdminDate(row.issue.createdAt, true)}
                  </Text>
                </YStack>
              </XStack>

              <XStack gap="$4" flexWrap="wrap">
                <Block title="Versione del cliente">
                  <Text color={brand.grafite}>“{row.issue.description}”</Text>
                  <Photos urls={row.issue.photoUrls} />
                </Block>
                <Block title="Risposta del professionista">
                  {row.issue.professionalResponse ? (
                    <Text color={brand.grafite}>“{row.issue.professionalResponse}”</Text>
                  ) : (
                    <Text fontSize={13} color={brand.grafite70}>
                      Non ha ancora risposto.
                    </Text>
                  )}
                </Block>
              </XStack>

              <XStack gap="$4" flexWrap="wrap" paddingTop="$2" borderTopWidth={1} borderTopColor={brand.filetto}>
                <Block title="A lavoro terminato: professionista">
                  <Text fontSize={13} color={brand.grafite70}>
                    {row.professionalCompletedAt
                      ? `Ha chiuso il lavoro il ${formatAdminDate(row.professionalCompletedAt, true)}${row.finalAmountEurCents !== null ? ` · €${(row.finalAmountEurCents / 100).toFixed(2)}` : ""}.`
                      : "Non ha chiuso il lavoro."}
                  </Text>
                  {row.completionChangeReason ? <Text fontSize={13} color={brand.grafite}>Motivo differenze: “{row.completionChangeReason}”</Text> : null}
                  {row.professionalCompletionNote ? <Text fontSize={13} color={brand.grafite}>Note: “{row.professionalCompletionNote}”</Text> : null}
                  <Photos urls={row.professionalCompletionPhotoUrls} />
                </Block>
                <Block title="A lavoro terminato: cliente">
                  <Text fontSize={13} color={brand.grafite70}>
                    {row.clientConfirmedAt ? `Ha confermato il ${formatAdminDate(row.clientConfirmedAt, true)}.` : "Non ha confermato il lavoro."}
                  </Text>
                  {row.clientCompletionNote ? <Text fontSize={13} color={brand.grafite}>Note: “{row.clientCompletionNote}”</Text> : null}
                  <Photos urls={row.clientCompletionPhotoUrls} />
                </Block>
              </XStack>

              {row.issue.status === "OPEN" ? (
                <DecisionForm row={row} token={token} onDone={() => setReload((n) => n + 1)} />
              ) : (
                <YStack gap="$1" paddingTop="$2" borderTopWidth={1} borderTopColor={brand.filetto}>
                  <Text fontWeight="700" color={brand.grafite}>
                    Decisa il {formatAdminDate(row.issue.resolvedAt, true)}
                  </Text>
                  {row.issue.resolutionNote ? <Text color={brand.grafite}>“{row.issue.resolutionNote}”</Text> : null}
                </YStack>
              )}
            </AdminCard>
          ))}
        </YStack>
      ) : null}
    </YStack>
  );
}
