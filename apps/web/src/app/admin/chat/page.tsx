"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { AdminConversation } from "@professionisti/api-client";
import { Text, YStack, brand } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/lib/AuthContext";
import { AdminPageHeader, errorMessage, formatAdminDate } from "@/components/admin/adminUi";
import { SkeletonTableRows } from "@/components/Skeleton";

const ACTOR_LABEL: Record<string, string> = { CLIENT: "Cliente", PROFESSIONAL: "Professionista", SYSTEM: "Automatico" };

/**
 * Tutte le chat tra cliente e professionista (docs/CHANGELOG.md §166,
 * richiesta esplicita dell'utente), anche senza una segnalazione. Sola
 * lettura; ogni chat aperta resta nel registro azioni.
 */
export default function AdminChatPage() {
  const { token } = useAuth();
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<AdminConversation[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    const handle = setTimeout(() => {
      apiClient
        .adminListConversations(token, query)
        .then((data) => {
          setRows(data);
          setError(null);
        })
        .catch((err) => setError(errorMessage(err)));
    }, 250);
    return () => clearTimeout(handle);
  }, [token, query]);

  return (
    <YStack>
      <AdminPageHeader
        title="Chat"
        description="Conversazioni tra clienti e professionisti, in sola lettura. Ogni chat che apri resta nel registro azioni."
      />
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Cerca per cliente, email o professionista"
        aria-label="Cerca chat"
        style={{ width: "100%", boxSizing: "border-box", padding: "10px 14px", borderRadius: 999, border: `1px solid ${brand.filetto}`, fontSize: 14, marginBottom: 16 }}
      />
      {error ? <Text color={brand.urgenza}>{error}</Text> : null}
      {rows === null && !error ? (
        <SkeletonTableRows rows={4} cols={4} />
      ) : rows && rows.length === 0 ? (
        <Text color={brand.grafite70}>Nessuna chat trovata.</Text>
      ) : rows ? (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Ultimo messaggio</th>
                <th>Cliente</th>
                <th>Professionista</th>
                <th>Richiesta</th>
                <th>Messaggi</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const href = `/admin/chat/${row.guidedRequestId}/${row.professionalProfileId}`;
                return (
                  <tr key={`${row.guidedRequestId}:${row.professionalProfileId}`}>
                    <td>
                      <Link href={href}>{formatAdminDate(row.lastMessageAt, true)}</Link>
                      <br />
                      <small>
                        {ACTOR_LABEL[row.lastActor] ?? row.lastActor}: {row.lastMessage.length > 90 ? `${row.lastMessage.slice(0, 90)}…` : row.lastMessage || "(foto o video)"}
                      </small>
                    </td>
                    <td>{row.clientName ? <Link href={`/admin/utenti/${row.clientUserId}`}>{row.clientName}</Link> : "Account eliminato"}</td>
                    <td>
                      <Link href={`/admin/utenti/${row.professionalUserId}`}>{row.businessName}</Link>
                    </td>
                    <td>
                      {row.categoryLabel} · {row.city}
                    </td>
                    <td>
                      <Link href={href}>{row.messageCount === 1 ? "1 messaggio" : `${row.messageCount} messaggi`}</Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </YStack>
  );
}
