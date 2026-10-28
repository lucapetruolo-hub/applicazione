"use client";

import { useCallback, useEffect, useState } from "react";
import { OUT_OF_SERVICE_LABELS, type ProblemTakeoverAdmin } from "@professionisti/shared";
import { Button, Text, YStack, brand } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/lib/AuthContext";
import { AdminPageHeader, AdminTabs, errorMessage, formatAdminDate } from "@/components/admin/adminUi";
import { SkeletonTableRows } from "@/components/Skeleton";

/**
 * "Richieste da seguire" (docs/CHANGELOG.md §392, decisione di Luca):
 * lavori che nessun professionista del sito fa, per cui il cliente ha
 * premuto "Prendete in carico la richiesta". Nessuna scadenza: restano
 * qui finché non si segnano come fatte.
 */
export default function AdminRichiesteDaSeguirePage() {
  const { token } = useAuth();
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

  return (
    <YStack>
      <AdminPageHeader
        title="Richieste da seguire"
        description="Lavori che nessun professionista del sito fa: il cliente ha chiesto a noi di trovare qualcuno. Contattalo e segna la richiesta come fatta."
      />
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
        <Text color={brand.grafite70} marginTop="$3">
          {tab === "aperte" ? "Nessuna richiesta da seguire." : "Nessuna richiesta fatta."}
        </Text>
      ) : rows ? (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Lavoro</th>
                <th>Descrizione</th>
                <th>Città</th>
                <th>Cliente</th>
                <th>Inviata</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>
                    {row.outOfService
                      ? (OUT_OF_SERVICE_LABELS[row.outOfService as keyof typeof OUT_OF_SERVICE_LABELS] ?? row.outOfService)
                      : "—"}
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
                    <Button
                      size="$2"
                      variant={tab === "aperte" ? "primary" : "secondary"}
                      disabled={busy !== null}
                      onPress={() => void mark(row.id, tab === "aperte")}
                    >
                      {tab === "aperte" ? "Fatto" : "Riapri"}
                    </Button>
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
