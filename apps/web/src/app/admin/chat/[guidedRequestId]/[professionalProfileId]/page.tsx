"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import type { AdminConversationDetail } from "@professionisti/api-client";
import { JOB_ISSUE_LABEL, JOB_ISSUE_STATUS_LABEL } from "@professionisti/shared";
import { Text, XStack, YStack, brand } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/lib/AuthContext";
import { AdminCard, AdminPageHeader, AdminPill, errorMessage, formatAdminDate } from "@/components/admin/adminUi";
import { MediaPreview } from "@/components/MediaPreview";
import { SkeletonTableRows } from "@/components/Skeleton";

/**
 * Una chat tra cliente e professionista, in sola lettura (docs/CHANGELOG.md
 * §166). Cliente a sinistra, professionista a destra, messaggi automatici al
 * centro. L'apertura resta nel registro azioni.
 */
export default function AdminChatDetailPage() {
  const params = useParams<{ guidedRequestId: string; professionalProfileId: string }>();
  const { token } = useAuth();
  const [chat, setChat] = useState<AdminConversationDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token || !params.guidedRequestId || !params.professionalProfileId) return;
    apiClient
      .adminGetConversation(token, params.guidedRequestId, params.professionalProfileId)
      .then(setChat)
      .catch((err) => setError(errorMessage(err)));
  }, [token, params.guidedRequestId, params.professionalProfileId]);

  const clientName = chat?.clientName ?? "Cliente";

  return (
    <YStack>
      <Link href="/admin/chat" style={{ fontSize: 14, marginBottom: 8 }}>
        ← Tutte le chat
      </Link>
      <AdminPageHeader
        title={chat ? `${clientName} e ${chat.businessName}` : "Chat"}
        description={chat ? `${chat.categoryLabel} · ${chat.city}. Sola lettura: questa apertura resta nel registro azioni.` : undefined}
      />
      {error ? <Text color={brand.urgenza}>{error}</Text> : null}
      {!chat && !error ? <SkeletonTableRows rows={4} cols={2} /> : null}
      {chat ? (
        <YStack gap="$3">
          <AdminCard>
            <Text fontSize={13} color={brand.grafite70}>
              Richiesta: {chat.requestDescription}
            </Text>
            <XStack gap="$3" flexWrap="wrap" alignItems="center">
              {chat.clientName ? <Link href={`/admin/utenti/${chat.clientUserId}`}>Scheda cliente</Link> : <Text fontSize={13}>Account cliente eliminato</Text>}
              <Link href={`/admin/utenti/${chat.professionalUserId}`}>Scheda professionista</Link>
              {chat.issue ? (
                <Link href="/admin/problemi">
                  <AdminPill tone={chat.issue.status === "OPEN" ? "warn" : "neutral"}>
                    {JOB_ISSUE_LABEL[chat.issue.type]} · {JOB_ISSUE_STATUS_LABEL[chat.issue.status]}
                  </AdminPill>
                </Link>
              ) : null}
            </XStack>
          </AdminCard>

          <YStack gap="$2">
            {chat.events.map((event) => {
              const system = event.actor === "SYSTEM";
              const fromClient = event.actor === "CLIENT";
              return (
                <YStack
                  key={event.id}
                  alignSelf={system ? "center" : fromClient ? "flex-start" : "flex-end"}
                  maxWidth={system ? "90%" : "80%"}
                  padding="$3"
                  borderRadius={12}
                  backgroundColor={system ? "transparent" : fromClient ? brand.calce : brand.cianografiaVelo}
                  borderWidth={system ? 0 : 1}
                  borderColor={brand.filetto}
                  gap="$1"
                >
                  <Text fontSize={12} fontWeight="700" color={brand.grafite70} textAlign={system ? "center" : "left"}>
                    {system ? "Automatico" : fromClient ? clientName : chat.businessName} · {formatAdminDate(event.createdAt, true)}
                  </Text>
                  {event.message ? (
                    <Text fontSize={14} color={system ? brand.grafite70 : brand.grafite} textAlign={system ? "center" : "left"}>
                      {event.message}
                    </Text>
                  ) : null}
                  {event.mediaUrls.length > 0 ? (
                    <XStack gap="$2" flexWrap="wrap">
                      {event.mediaUrls.map((url) => (
                        <a key={url} href={url} target="_blank" rel="noreferrer" style={{ width: 84, height: 84, borderRadius: 8, overflow: "hidden", display: "block" }}>
                          <MediaPreview url={url} />
                        </a>
                      ))}
                    </XStack>
                  ) : null}
                </YStack>
              );
            })}
          </YStack>
        </YStack>
      ) : null}
    </YStack>
  );
}
