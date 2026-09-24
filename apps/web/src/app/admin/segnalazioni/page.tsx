"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { AdminContentReport, ModerationActionValue } from "@professionisti/api-client";
import {
  CONTENT_REPORT_TARGET_LABEL,
  MODERATION_ACTIONS_BY_TARGET,
  MODERATION_REASON_TEMPLATES,
  moderationActionAdminLabel,
} from "@professionisti/shared";
import { Button, Text, XStack, YStack, brand } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/lib/AuthContext";
import { useAdminOverview } from "@/components/admin/AdminOverviewContext";
import { AdminCard, AdminPageHeader, AdminPill, AdminTabs, errorMessage, formatAdminDate } from "@/components/admin/adminUi";
import { SkeletonSummaryRow } from "@/components/Skeleton";

type View = "da-gestire" | "ricorsi" | "archivio";

/**
 * Coda di moderazione (docs/CHANGELOG.md §144, DSA artt. 16-20): "Risolvi"
 * apre le sole misure compatibili con il tipo di contenuto, con frasi di
 * motivazione pronte e la casella "segnalato alle autorità" (art. 18).
 * Le contestazioni degli autori (art. 20) hanno una vista a sé; in archivio
 * ogni decisione mostra la misura presa e si può annullare.
 */
export default function AdminSegnalazioniPage() {
  return (
    <Suspense fallback={null}>
      <SegnalazioniContent />
    </Suspense>
  );
}

function SegnalazioniContent() {
  const { token } = useAuth();
  const { refresh } = useAdminOverview();
  const searchParams = useSearchParams();
  const initialView = (searchParams.get("vista") as View | null) ?? "da-gestire";
  const [view, setView] = useState<View>(["da-gestire", "ricorsi", "archivio"].includes(initialView) ? initialView : "da-gestire");
  const [reports, setReports] = useState<AdminContentReport[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  function reload() {
    if (!token) return;
    apiClient
      .adminListContentReports(token)
      .then((list) => {
        setReports(list);
        setError(null);
      })
      .catch((err) => setError(errorMessage(err)));
    refresh();
  }
  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const open = reports?.filter((r) => r.status === "OPEN") ?? [];
  const appeals = reports?.filter((r) => r.appealedAt && !r.appealRejectedAt && !r.revertedAt) ?? [];
  const archive = (reports?.filter((r) => r.status !== "OPEN") ?? []).sort(
    (a, b) => new Date(b.resolvedAt ?? b.createdAt).getTime() - new Date(a.resolvedAt ?? a.createdAt).getTime(),
  );
  const list = view === "da-gestire" ? open : view === "ricorsi" ? appeals : archive;

  return (
    <YStack>
      <AdminPageHeader
        title="Segnalazioni"
        description="Decidi su contenuti segnalati dagli utenti. Ogni decisione arriva a chi ha segnalato e, se accolta, all'autore con la motivazione."
      />
      <AdminTabs<View>
        value={view}
        onChange={setView}
        tabs={[
          { key: "da-gestire", label: `Da gestire (${open.length})` },
          { key: "ricorsi", label: `Contestazioni (${appeals.length})` },
          { key: "archivio", label: "Archivio" },
        ]}
      />
      {error ? <Text color={brand.urgenza}>{error}</Text> : null}
      {reports === null && !error ? (
        <YStack backgroundColor={brand.calce} borderRadius={16} overflow="hidden">
          <SkeletonSummaryRow />
          <SkeletonSummaryRow />
        </YStack>
      ) : list.length === 0 ? (
        <Text color={brand.grafite70}>
          {view === "da-gestire" ? "Nessuna segnalazione da gestire." : view === "ricorsi" ? "Nessuna contestazione in attesa." : "Archivio vuoto."}
        </Text>
      ) : (
        <YStack gap="$3">
          {list.map((report) => (
            <ReportCard key={report.id} report={report} token={token ?? ""} onChanged={reload} />
          ))}
        </YStack>
      )}
    </YStack>
  );
}

/** Link al contenuto pubblico, quando esiste (una recensione sul cliente o una richiesta non hanno pagina pubblica). */
function reportTargetHref(report: AdminContentReport): string | null {
  if (report.targetType === "PROFESSIONAL_PROFILE") return `/professionista/${report.targetId}`;
  if (report.targetType === "REVIEW" && report.linkedProfessionalProfileId) {
    return `/professionista/${report.linkedProfessionalProfileId}#recensione-${report.targetId}`;
  }
  return null;
}

type Mode = "idle" | "resolve" | "dismiss" | "revert" | "reject-appeal";

function ReportCard({ report, token, onChanged }: { report: AdminContentReport; token: string; onChanged: () => void }) {
  const [mode, setMode] = useState<Mode>("idle");
  const [action, setAction] = useState<ModerationActionValue | null>(null);
  const [note, setNote] = useState("");
  const [authorities, setAuthorities] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const href = reportTargetHref(report);
  const allowedActions = MODERATION_ACTIONS_BY_TARGET[report.targetType];
  const appealPending = Boolean(report.appealedAt && !report.appealRejectedAt && !report.revertedAt);

  function start(next: Mode) {
    setMode(next);
    setNote("");
    setAction(null);
    setAuthorities(false);
    setError(null);
  }

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      setMode("idle");
      onChanged();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const canConfirm =
    mode === "resolve" ? Boolean(action) && note.trim().length >= 3 : mode === "dismiss" ? true : note.trim().length >= 3;

  return (
    <AdminCard highlight={report.status === "OPEN" || appealPending}>
      <XStack justifyContent="space-between" gap="$2" flexWrap="wrap" alignItems="center">
        <XStack gap="$2" alignItems="center" flexWrap="wrap">
          <AdminPill>{CONTENT_REPORT_TARGET_LABEL[report.targetType]}</AdminPill>
          {report.status === "RESOLVED" ? <AdminPill tone={report.revertedAt ? "neutral" : "danger"}>{report.revertedAt ? "Misura annullata" : "Accolta"}</AdminPill> : null}
          {report.status === "DISMISSED" ? <AdminPill tone="ok">Non accolta</AdminPill> : null}
          {report.authoritiesNotifiedAt ? <AdminPill tone="warn">Segnalata alle autorità</AdminPill> : null}
          {appealPending ? <AdminPill tone="warn">Contestata dall&apos;autore</AdminPill> : null}
        </XStack>
        <Text fontSize="$2" color={brand.grafite70}>
          Segnalata il {formatAdminDate(report.createdAt, true)}
        </Text>
      </XStack>

      <Text fontWeight="700" color={brand.grafite}>
        {report.targetLabel ?? "Contenuto non più disponibile"}
      </Text>
      {report.targetExcerpt ? (
        <YStack padding="$3" borderRadius={10} backgroundColor={brand.gesso}>
          <Text fontSize="$3" color={brand.grafite} numberOfLines={6}>
            “{report.targetExcerpt}”
          </Text>
        </YStack>
      ) : null}
      <Text fontSize="$3" color={brand.grafite}>
        <Text fontWeight="700">Motivo: </Text>
        {report.reason}
        {report.details ? ` — ${report.details}` : ""}
      </Text>
      <Text fontSize="$2" color={brand.grafite70}>
        Da {report.reporterName ?? "utente"} {report.reporterEmail ? `(${report.reporterEmail})` : ""}
      </Text>

      {report.status !== "OPEN" ? (
        <YStack gap="$1" paddingTop="$1">
          <Text fontSize="$3" color={brand.grafite}>
            <Text fontWeight="700">Decisione del {formatAdminDate(report.resolvedAt)}: </Text>
            {report.status === "RESOLVED" && report.action ? moderationActionAdminLabel(report.action, report.targetType) : "nessuna misura"}
          </Text>
          {report.resolutionNote ? (
            <Text fontSize="$3" color={brand.grafite70}>
              Motivazione: {report.resolutionNote}
            </Text>
          ) : null}
          {report.appealedAt ? (
            <Text fontSize="$3" color={brand.grafite}>
              <Text fontWeight="700">Contestazione dell&apos;autore ({formatAdminDate(report.appealedAt)}): </Text>“{report.appealText}”
            </Text>
          ) : null}
          {report.appealRejectedAt ? (
            <Text fontSize="$3" color={brand.grafite70}>
              Contestazione respinta: {report.appealRejectNote}
            </Text>
          ) : null}
          {report.revertedAt ? (
            <Text fontSize="$3" color={brand.grafite70}>
              Misura annullata il {formatAdminDate(report.revertedAt)}: {report.revertNote}
            </Text>
          ) : null}
        </YStack>
      ) : null}

      {mode === "idle" ? (
        <XStack gap="$2" flexWrap="wrap" paddingTop="$1">
          {href ? (
            <Link href={href} target="_blank" style={{ textDecoration: "none" }}>
              <Button variant="secondary" size="$3">
                Apri contenuto
              </Button>
            </Link>
          ) : null}
          {report.status === "OPEN" ? (
            <>
              <Button variant="primary" size="$3" onPress={() => start("resolve")}>
                Risolvi
              </Button>
              <Button variant="secondary" size="$3" onPress={() => start("dismiss")}>
                Ignora
              </Button>
            </>
          ) : null}
          {report.status === "RESOLVED" && !report.revertedAt && report.action ? (
            <Button variant="secondary" size="$3" onPress={() => start("revert")}>
              Annulla misura
            </Button>
          ) : null}
          {appealPending ? (
            <Button variant="secondary" size="$3" onPress={() => start("reject-appeal")}>
              Respingi contestazione
            </Button>
          ) : null}
        </XStack>
      ) : (
        <YStack gap="$3" padding="$3" borderRadius={12} backgroundColor={brand.gesso}>
          {mode === "resolve" ? (
            <>
              <Text fontWeight="700" color={brand.grafite}>
                Quale misura prendi?
              </Text>
              <YStack gap="$2">
                {allowedActions.map((a) => (
                  <label key={a} style={{ display: "flex", gap: 8, alignItems: "flex-start", cursor: "pointer", fontSize: 14 }}>
                    <input type="radio" name={`action-${report.id}`} checked={action === a} onChange={() => setAction(a)} />
                    <span>{moderationActionAdminLabel(a, report.targetType)}</span>
                  </label>
                ))}
              </YStack>
              <Text fontSize="$2" color={brand.grafite70}>
                Una recensione negativa ma vera non va nascosta: si nasconde solo se viola le regole (offese, dati personali, falsa).
              </Text>
              <Text fontWeight="700" color={brand.grafite}>
                Motivazione per l&apos;autore
              </Text>
              <XStack gap="$2" flexWrap="wrap">
                {MODERATION_REASON_TEMPLATES.map((t) => (
                  <XStack
                    key={t.label}
                    paddingHorizontal={10}
                    paddingVertical={5}
                    borderRadius={999}
                    borderWidth={1}
                    borderColor={brand.filetto}
                    backgroundColor={brand.calce}
                    cursor="pointer"
                    onPress={() => setNote(t.text)}
                  >
                    <Text fontSize={13} color={brand.grafite}>
                      {t.label}
                    </Text>
                  </XStack>
                ))}
              </XStack>
            </>
          ) : (
            <Text fontWeight="700" color={brand.grafite}>
              {mode === "dismiss"
                ? "Non accogliere la segnalazione? Chi ha segnalato riceverà l'esito."
                : mode === "revert"
                  ? "Annullare la misura? Il contenuto torna com'era e l'autore viene avvisato."
                  : "Respingere la contestazione? La misura resta e l'autore riceve la motivazione."}
            </Text>
          )}
          <textarea
            className="admin-input admin-textarea"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={mode === "dismiss" ? "Motivazione (facoltativa)" : "Motivazione (obbligatoria)"}
          />
          {mode === "resolve" ? (
            <label style={{ display: "flex", gap: 8, alignItems: "flex-start", cursor: "pointer", fontSize: 14 }}>
              <input type="checkbox" checked={authorities} onChange={(e) => setAuthorities(e.target.checked)} />
              <span>
                Ho segnalato il caso alle autorità (obbligatorio se c&apos;è un sospetto reato che mette in pericolo la vita o la sicurezza di
                qualcuno, DSA art. 18)
              </span>
            </label>
          ) : null}
          {error ? <Text color={brand.urgenza}>{error}</Text> : null}
          <XStack gap="$2" flexWrap="wrap">
            <Button
              variant="primary"
              size="$3"
              disabled={busy || !canConfirm}
              onPress={() =>
                run(() => {
                  if (mode === "resolve")
                    return apiClient.adminResolveContentReport(token, report.id, {
                      status: "RESOLVED",
                      action: action ?? undefined,
                      resolutionNote: note,
                      authoritiesNotified: authorities,
                    });
                  if (mode === "dismiss")
                    return apiClient.adminResolveContentReport(token, report.id, { status: "DISMISSED", resolutionNote: note || undefined });
                  if (mode === "revert") return apiClient.adminRevertContentReport(token, report.id, note);
                  return apiClient.adminRejectAppeal(token, report.id, note);
                })
              }
            >
              {busy ? "Salvataggio…" : mode === "resolve" ? "Applica misura" : mode === "dismiss" ? "Conferma: non accolta" : "Conferma"}
            </Button>
            <Button variant="secondary" size="$3" onPress={() => setMode("idle")}>
              Annulla
            </Button>
          </XStack>
        </YStack>
      )}
    </AdminCard>
  );
}
