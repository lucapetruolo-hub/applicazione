"use client";

import { useEffect, useState } from "react";
import type { AdminContactMessage } from "@professionisti/api-client";
import { Button, Text, XStack, YStack, brand } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/lib/AuthContext";
import { useAdminOverview } from "@/components/admin/AdminOverviewContext";
import { AdminCard, AdminPageHeader, AdminPill, AdminTabs, errorMessage, formatAdminDate } from "@/components/admin/adminUi";
import { SkeletonSummaryRow } from "@/components/Skeleton";

const ROLE_LABEL: Record<AdminContactMessage["role"], string> = { CLIENT: "Cliente", PROFESSIONAL: "Professionista", OTHER: "Altro" };

/**
 * Messaggi dal modulo "Contatti" (docs/CHANGELOG.md §144): si risponde con un
 * clic (email già compilata) e quelli gestiti restano in archivio invece di
 * sparire.
 */
export default function AdminMessaggiPage() {
  const { token } = useAuth();
  const { refresh } = useAdminOverview();
  const [view, setView] = useState<"aperti" | "archivio">("aperti");
  const [messages, setMessages] = useState<AdminContactMessage[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  function reload() {
    if (!token) return;
    setMessages(null);
    apiClient
      .adminListContactMessages(token, view === "archivio")
      .then((list) => {
        setMessages(list);
        setError(null);
      })
      .catch((err) => setError(errorMessage(err)));
    refresh();
  }
  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, view]);

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
      {messages === null && !error ? (
        <YStack backgroundColor={brand.calce} borderRadius={16} overflow="hidden">
          <SkeletonSummaryRow />
          <SkeletonSummaryRow />
        </YStack>
      ) : messages && messages.length === 0 ? (
        <Text color={brand.grafite70}>{view === "aperti" ? "Nessun messaggio da gestire." : "Archivio vuoto."}</Text>
      ) : (
        <YStack gap="$3">
          {messages?.map((message) => <MessageCard key={message.id} message={message} token={token ?? ""} onChanged={reload} />)}
        </YStack>
      )}
    </YStack>
  );
}

function MessageCard({ message, token, onChanged }: { message: AdminContactMessage; token: string; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mailto = `mailto:${message.email}?subject=${encodeURIComponent("Risposta al tuo messaggio")}&body=${encodeURIComponent(
    `\n\n---\nIl tuo messaggio del ${formatAdminDate(message.createdAt)}:\n${message.content}`,
  )}`;

  async function resolve() {
    setBusy(true);
    setError(null);
    try {
      await apiClient.adminResolveContactMessage(token, message.id);
      onChanged();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminCard>
      <XStack justifyContent="space-between" gap="$2" flexWrap="wrap" alignItems="center">
        <XStack gap="$2" alignItems="center" flexWrap="wrap">
          <AdminPill>{ROLE_LABEL[message.role]}</AdminPill>
          <Text fontWeight="700" color={brand.grafite}>
            {message.email}
          </Text>
        </XStack>
        <Text fontSize="$2" color={brand.grafite70}>
          {formatAdminDate(message.createdAt, true)}
        </Text>
      </XStack>
      <Text color={brand.grafite} style={{ whiteSpace: "pre-wrap" }}>
        {message.content}
      </Text>
      {error ? <Text color={brand.urgenza}>{error}</Text> : null}
      <XStack gap="$2" flexWrap="wrap">
        <a href={mailto} style={{ textDecoration: "none" }}>
          <Button variant="secondary" size="$3">
            Rispondi via email
          </Button>
        </a>
        {!message.resolved ? (
          <Button variant="primary" size="$3" disabled={busy} onPress={resolve}>
            {busy ? "…" : "Segna come gestito"}
          </Button>
        ) : null}
      </XStack>
    </AdminCard>
  );
}
