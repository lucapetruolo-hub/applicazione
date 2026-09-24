"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { AdminAuditLogPage } from "@professionisti/api-client";
import { Button, Text, XStack, YStack, brand } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/lib/AuthContext";
import { AdminPageHeader, errorMessage, formatAdminDate } from "@/components/admin/adminUi";
import { SkeletonTableRows } from "@/components/Skeleton";

const ENTITY_LABEL: Record<string, string> = {
  User: "Utente",
  ContentReport: "Segnalazione",
  Refund: "Rimborso",
  Dispute: "Contestazione pagamento",
  JobPayment: "Pagamento",
  ProfessionalFiscalProfile: "Dati fiscali",
};

/**
 * Registro delle azioni admin (docs/CHANGELOG.md §145, solo super admin):
 * chi ha fatto cosa e quando — decisioni sulle segnalazioni, sospensioni,
 * ruoli, rimborsi. Utile anche come traccia delle decisioni per il DSA.
 */
export default function AdminRegistroPage() {
  const { token } = useAuth();
  const [page, setPage] = useState(1);
  const [entityType, setEntityType] = useState("");
  const [data, setData] = useState<AdminAuditLogPage | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    setData(null);
    apiClient
      .adminAuditLog(token, page, entityType || undefined)
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((err) => setError(errorMessage(err)));
  }, [token, page, entityType]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <YStack>
      <AdminPageHeader title="Registro azioni" description="Chi ha fatto cosa e quando nel pannello." />
      <XStack marginBottom="$3">
        <select
          className="admin-input"
          value={entityType}
          onChange={(e) => {
            setEntityType(e.target.value);
            setPage(1);
          }}
        >
          <option value="">Tutte le azioni</option>
          {Object.entries(ENTITY_LABEL).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </XStack>
      {error ? <Text color={brand.urgenza}>{error}</Text> : null}
      {data === null && !error ? (
        <SkeletonTableRows rows={6} cols={4} />
      ) : data && data.rows.length === 0 ? (
        <Text color={brand.grafite70}>Nessuna azione registrata.</Text>
      ) : data ? (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Quando</th>
                <th>Chi</th>
                <th>Su cosa</th>
                <th>Azione</th>
                <th>Motivo</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row) => (
                <tr key={row.id}>
                  <td style={{ whiteSpace: "nowrap" }}>{formatAdminDate(row.createdAt, true)}</td>
                  <td>{row.changedByEmail ?? "Sistema"}</td>
                  <td>
                    {row.entityType === "User" ? (
                      <Link href={`/admin/utenti/${row.entityId}`}>{row.entityLabel ?? "Utente"}</Link>
                    ) : (
                      (ENTITY_LABEL[row.entityType] ?? row.entityType)
                    )}
                  </td>
                  <td>{row.label}</td>
                  <td>{row.reason ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {data && totalPages > 1 ? (
        <XStack gap="$2" alignItems="center" marginTop="$3">
          <Button variant="secondary" size="$3" disabled={page <= 1} onPress={() => setPage((p) => p - 1)}>
            Precedente
          </Button>
          <Text color={brand.grafite70}>
            Pagina {page} di {totalPages}
          </Text>
          <Button variant="secondary" size="$3" disabled={page >= totalPages} onPress={() => setPage((p) => p + 1)}>
            Successiva
          </Button>
        </XStack>
      ) : null}
    </YStack>
  );
}
