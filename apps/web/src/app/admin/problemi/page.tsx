"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { AdminJobIssue } from "@professionisti/api-client";
import { JOB_ISSUE_ESCALATION_LABEL, JOB_ISSUE_LABEL, JOB_ISSUE_SANCTION_LABEL, JOB_ISSUE_STATUS_LABEL } from "@professionisti/shared";
import { AppealForm, DecisionForm, PhaseDeadline } from "./JobIssueForms";
import { Text, XStack, YStack, brand } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/lib/AuthContext";
import { AdminCard, AdminPageHeader, AdminPill, AdminTabs, errorMessage, formatAdminDate } from "@/components/admin/adminUi";
import { MediaPreview } from "@/components/MediaPreview";
import { SkeletonTableRows } from "@/components/Skeleton";

type View = "open" | "chat" | "appeals" | "closed";

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

/**
 * Problemi segnalati dai clienti (docs/CHANGELOG.md §164-§165, §167):
 * mancata presentazione o lavoro non andato bene. Prima fase in chat (48 ore
 * al professionista), poi qui con le scadenze del modello Amazon A-Z e il
 * tab dei ricorsi. Tutto ciò che serve a decidere
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
        description="Mancate presentazioni e lavori non andati bene non risolti in chat. Il professionista ha 72 ore per la sua versione (o per le informazioni che chiedi), poi la segnalazione è accolta da sola; con le prove complete decidi entro 2 giorni."
      />
      <AdminTabs
        tabs={[
          { key: "open", label: "Da decidere" },
          { key: "chat", label: "In chat tra le parti" },
          { key: "appeals", label: "Ricorsi" },
          { key: "closed", label: "Chiuse" },
        ]}
        value={view}
        onChange={setView}
      />
      {error ? <Text color={brand.urgenza}>{error}</Text> : null}
      {rows === null && !error ? (
        <SkeletonTableRows rows={3} cols={4} />
      ) : rows && rows.length === 0 ? (
        <Text color={brand.grafite70}>
          {view === "open"
            ? "Nessuna segnalazione da decidere."
            : view === "chat"
              ? "Nessuna segnalazione in chat tra le parti."
              : view === "appeals"
                ? "Nessun ricorso da decidere."
                : "Nessuna segnalazione chiusa finora."}
        </Text>
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
                  <Text fontSize={13} color={row.professional.upheldLast30Days > 0 ? brand.urgenza : brand.grafite70}>
                    Segnalazioni accolte al professionista negli ultimi 30 giorni: {row.professional.upheldLast30Days}
                    {row.professional.blocked ? " · non riceve nuove richieste" : row.professional.demoted ? " · profilo abbassato" : ""}
                  </Text>
                  {row.guidedRequestId ? (
                    <Link href={`/admin/chat/${row.guidedRequestId}/${row.professional.profileId}`} style={{ fontSize: 13, fontWeight: 700 }}>
                      Leggi la chat
                    </Link>
                  ) : null}
                  <PhaseDeadline row={row} />
                  {row.issue.escalationReason ? (
                    <Text fontSize={13} color={brand.grafite70}>
                      Passata a noi: {JOB_ISSUE_ESCALATION_LABEL[row.issue.escalationReason].toLowerCase()}.
                    </Text>
                  ) : null}
                </YStack>
                <YStack alignItems="flex-end" gap="$1">
                  <AdminPill tone={row.issue.status === "OPEN" ? "warn" : row.issue.status === "UPHELD" ? "danger" : row.issue.status === "RESOLVED" ? "ok" : "neutral"}>
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
                <Block title="Versione del professionista">
                  {row.issue.professionalResponse ? (
                    <Text color={brand.grafite}>“{row.issue.professionalResponse}”</Text>
                  ) : (
                    <Text fontSize={13} color={brand.grafite70}>
                      Non ha ancora risposto.
                    </Text>
                  )}
                  {row.issue.infoRequestText ? (
                    <Text fontSize={13} color={brand.grafite}>
                      Informazioni chieste: “{row.issue.infoRequestText}”
                      {row.issue.infoResponse ? ` · Risposta: “${row.issue.infoResponse}”` : " · nessuna risposta ancora"}
                    </Text>
                  ) : null}
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

              {view === "appeals" ? (
                <YStack gap="$2" paddingTop="$2" borderTopWidth={1} borderTopColor={brand.filetto}>
                  <Text fontWeight="700" color={brand.grafite}>
                    Decisa il {formatAdminDate(row.issue.resolvedAt, true)}
                    {row.issue.autoDecision ? " automaticamente" : ""}
                    {row.issue.sanction ? ` · misura: ${JOB_ISSUE_SANCTION_LABEL[row.issue.sanction].toLowerCase()}` : ""}
                  </Text>
                  {row.issue.resolutionNote ? <Text color={brand.grafite}>“{row.issue.resolutionNote}”</Text> : null}
                  <Text fontWeight="700" color={brand.grafite}>
                    Ricorso del {formatAdminDate(row.issue.appealedAt, true)}
                  </Text>
                  <Text color={brand.grafite}>“{row.issue.appealText}”</Text>
                  <AppealForm row={row} token={token} onDone={() => setReload((n) => n + 1)} />
                </YStack>
              ) : row.issue.status === "OPEN" ? (
                <DecisionForm row={row} token={token} onDone={() => setReload((n) => n + 1)} />
              ) : row.issue.status === "CHAT" ? (
                <Text fontSize={13} color={brand.grafite70}>
                  Cliente e professionista stanno provando a risolvere in chat: arriva qui se il professionista non risponde entro 48 ore o se il
                  cliente lo chiede.
                </Text>
              ) : row.issue.status === "RESOLVED" ? (
                <Text fontWeight="700" color={brand.grafite}>
                  Risolta tra le parti il {formatAdminDate(row.issue.resolvedAt, true)}
                </Text>
              ) : (
                <YStack gap="$1" paddingTop="$2" borderTopWidth={1} borderTopColor={brand.filetto}>
                  <Text fontWeight="700" color={brand.grafite}>
                    Decisa il {formatAdminDate(row.issue.resolvedAt, true)}
                    {row.issue.autoDecision ? " automaticamente" : ""}
                    {row.issue.sanction ? ` · misura: ${JOB_ISSUE_SANCTION_LABEL[row.issue.sanction].toLowerCase()}` : ""}
                  </Text>
                  {row.issue.resolutionNote ? <Text color={brand.grafite}>“{row.issue.resolutionNote}”</Text> : null}
                  {row.issue.appealDecision ? (
                    <Text fontSize={13} color={brand.grafite}>
                      Ricorso {row.issue.appealDecision === "ACCEPTED" ? "accolto" : "respinto"}: “{row.issue.appealNote}”
                    </Text>
                  ) : row.issue.appealedAt ? (
                    <Text fontSize={13} color={brand.grafite70}>
                      Ricorso presentato: da decidere nel tab Ricorsi.
                    </Text>
                  ) : null}
                </YStack>
              )}
            </AdminCard>
          ))}
        </YStack>
      ) : null}
    </YStack>
  );
}
