"use client";

import { useEffect, useRef, useState } from "react";
import type { AdminContactMessage } from "@professionisti/api-client";
import { Button, Text, XStack, YStack, brand } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/lib/AuthContext";
import { useAdminOverview } from "@/components/admin/AdminOverviewContext";
import { AdminCard, AdminPageHeader, AdminPill, AdminTabs, errorMessage, formatAdminDate } from "@/components/admin/adminUi";
import { SkeletonSummaryRow } from "@/components/Skeleton";
import { CaseAdviceBox, useCaseAdvice } from "@/components/admin/CaseAdviceBox";
import type { CaseAdvice } from "@professionisti/shared";

const ROLE_LABEL: Record<AdminContactMessage["role"], string> = { CLIENT: "Cliente", PROFESSIONAL: "Professionista", OTHER: "Altro", REPORT_ILLEGAL: "Segnalazione di contenuto illegale" };

/**
 * Messaggi dal modulo "Contatti" (docs/CHANGELOG.md §144): si risponde con un
 * clic (email già compilata) e quelli gestiti restano in archivio invece di
 * sparire.
 */
export default function AdminMessaggiPage() {
  const { token } = useAuth();
  const { refresh } = useAdminOverview();
  const [view, setView] = useState<"aperti" | "archivio">("aperti");
  const [error, setError] = useState<string | null>(null);
  // Bozza di risposta dell'IA (docs/changelog/2026-11-13-admin-ia-propone.md): mai inviata da sola.
  const advice = useCaseAdvice(token);
  // Ogni messaggio gestito fa ricaricare l'elenco.
  const [version, setVersion] = useState(0);
  // Elenco insieme alla scheda (e al ricaricamento) da cui arriva: fino
  // all'elenco nuovo si vede lo scheletro.
  const loadKey = `${view}:${version}`;
  const [loaded, setLoaded] = useState<{ key: string; messages: AdminContactMessage[] } | null>(null);
  const messages = loaded?.key === loadKey ? loaded.messages : null;

  function reload() {
    setVersion((n) => n + 1);
  }
  // "Annulla" per qualche secondo dopo "Segna come gestito" (misura "dopo" del riordino).
  const [undo, setUndo] = useState<AdminContactMessage | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (undoTimer.current) clearTimeout(undoTimer.current);
  }, []);
  function resolved(message: AdminContactMessage) {
    if (undoTimer.current) clearTimeout(undoTimer.current);
    setUndo(message);
    undoTimer.current = setTimeout(() => setUndo(null), 10_000);
    reload();
  }
  async function undoResolve() {
    if (!undo || !token) return;
    const message = undo;
    setUndo(null);
    try {
      await apiClient.adminReopenContactMessage(token, message.id);
      reload();
    } catch (err) {
      setError(errorMessage(err));
    }
  }
  useEffect(() => {
    if (!token) return;
    apiClient
      .adminListContactMessages(token, view === "archivio")
      .then((list) => {
        setLoaded({ key: `${view}:${version}`, messages: list });
        setError(null);
      })
      .catch((err) => setError(errorMessage(err)));
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refresh cambia a ogni aggiornamento del riepilogo
  }, [token, view, version]);

  return (
    <YStack>
      <AdminPageHeader title="Messaggi" description="Messaggi arrivati dal modulo Contatti del sito." />
      <AdminTabs
        value={view}
        onChange={setView}
        tabs={[
          { key: "aperti", label: "Da gestire" },
          { key: "archivio", label: "Archivio" },
        ]}
      />
      {error ? <Text color={brand.urgenza}>{error}</Text> : null}
      {undo ? (
        <XStack role="status" gap="3" alignItems="center" flexWrap="wrap" padding="3" marginBottom="3" borderRadius={10} backgroundColor={brand.gesso}>
          <Text color={brand.grafite}>{`Messaggio di ${undo.email} spostato nell'archivio.`}</Text>
          <Button variant="secondary" size="3" onPress={undoResolve}>
            Annulla
          </Button>
        </XStack>
      ) : null}
      {messages === null && !error ? (
        <YStack backgroundColor={brand.calce} borderRadius={20} overflow="hidden">
          <SkeletonSummaryRow />
          <SkeletonSummaryRow />
        </YStack>
      ) : messages && messages.length === 0 ? (
        <Text color={brand.grafite70}>{view === "aperti" ? "Nessun messaggio da gestire." : "Archivio vuoto."}</Text>
      ) : (
        <YStack gap="3">
          {messages?.map((message) => <MessageCard
              key={message.id}
              message={message}
              token={token ?? ""}
              advice={message.resolved ? null : advice.get("CONTACT_MESSAGE", message.id)}
              onResolved={() => resolved(message)}
              onChanged={reload}
            />)}
        </YStack>
      )}
    </YStack>
  );
}

function MessageCard({
  message,
  token,
  advice,
  onResolved,
  onChanged,
}: {
  message: AdminContactMessage;
  token: string;
  advice: CaseAdvice | null;
  onResolved: () => void;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Segnalazione di contenuto illegale senza account (docs/CHANGELOG.md
  // §319): l'esito in una riga va comunicato per legge (DSA art. 16 c. 5),
  // senza motivazione. La risposta parte già scritta, si sceglie la frase.
  const isReport = message.role === "REPORT_ILLEGAL";
  const mailto = `mailto:${message.email}?subject=${encodeURIComponent(isReport ? "Esito della tua segnalazione" : "Risposta al tuo messaggio")}&body=${encodeURIComponent(
    `${
      isReport
        ? "Abbiamo letto la tua segnalazione e siamo intervenuti sul contenuto.\nAbbiamo letto la tua segnalazione: il contenuto resta.\n\nSe non sei d'accordo puoi rivolgerti all'autorità giudiziaria."
        : ""
    }\n\n---\nIl tuo messaggio del ${formatAdminDate(message.createdAt)}:\n${message.content}`,
  )}`;

  async function resolve() {
    setBusy(true);
    setError(null);
    try {
      await apiClient.adminResolveContactMessage(token, message.id);
      onResolved();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function reopen() {
    setBusy(true);
    setError(null);
    try {
      await apiClient.adminReopenContactMessage(token, message.id);
      onChanged();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminCard>
      <XStack justifyContent="space-between" gap="2" flexWrap="wrap" alignItems="center">
        <XStack gap="2" alignItems="center" flexWrap="wrap">
          <AdminPill tone={isReport ? "danger" : "neutral"}>{ROLE_LABEL[message.role]}</AdminPill>
          <Text fontWeight="700" color={brand.grafite}>
            {message.email}
          </Text>
        </XStack>
        <Text fontSize="2" color={brand.grafite70}>
          {formatAdminDate(message.createdAt, true)}
        </Text>
      </XStack>
      <Text color={brand.grafite} style={{ whiteSpace: "pre-wrap" }}>
        {message.content}
      </Text>
      {isReport ? (
        <Text fontSize="2" color={brand.grafite70}>
          Rispondi in una riga, senza il perché. Usa una delle due frasi pronte.
        </Text>
      ) : null}
      {advice ? <CaseAdviceBox advice={advice} token={token} onApproved={onChanged} replyTo={message.email} /> : null}
      {error ? <Text color={brand.urgenza}>{error}</Text> : null}
      <XStack gap="2" flexWrap="wrap">
        <a href={mailto} style={{ textDecoration: "none" }}>
          <Button tabIndex={-1} variant="secondary" size="3">
            {isReport ? "Invia l'esito via email" : "Rispondi via email"}
          </Button>
        </a>
        {!message.resolved ? (
          <Button variant="primary" size="3" disabled={busy} onPress={resolve}>
            {busy ? "…" : "Segna come gestito"}
          </Button>
        ) : (
          <Button variant="secondary" size="3" disabled={busy} onPress={reopen}>
            {busy ? "…" : "Riapri"}
          </Button>
        )}
      </XStack>
    </AdminCard>
  );
}
