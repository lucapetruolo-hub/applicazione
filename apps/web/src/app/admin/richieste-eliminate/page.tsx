"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { AdminHiddenLead } from "@professionisti/api-client";
import { Text, YStack, brand } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/lib/AuthContext";
import { AdminPageHeader, errorMessage, formatAdminDate } from "@/components/admin/adminUi";
import { SkeletonTableRows } from "@/components/Skeleton";

/** Richieste "eliminate" dai professionisti: nascoste a loro, mai cancellate (docs/CHANGELOG.md §143). */
export default function AdminRichiesteEliminatePage() {
  const { token } = useAuth();
  const [rows, setRows] = useState<AdminHiddenLead[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    apiClient
      .adminListHiddenLeads(token)
      .then(setRows)
      .catch((err) => setError(errorMessage(err)));
  }, [token]);

  return (
    <YStack>
      <AdminPageHeader
        title="Richieste eliminate"
        description='Tolte dalla lista "Richieste ricevute" di un professionista, ma mai cancellate: il cliente continua a vederle.'
      />
      {error ? <Text color={brand.urgenza}>{error}</Text> : null}
      {rows === null && !error ? (
        <SkeletonTableRows rows={3} cols={5} />
      ) : rows && rows.length === 0 ? (
        <Text color={brand.grafite70}>Nessuna richiesta eliminata finora.</Text>
      ) : rows ? (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Eliminata il</th>
                <th>Professionista</th>
                <th>Richiesta</th>
                <th>Cliente</th>
                <th>Stato</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.leadId}>
                  <td>{formatAdminDate(row.hiddenAt)}</td>
                  <td>
                    <Link href={`/professionista/${row.professionalProfileId}`}>{row.businessName}</Link>
                  </td>
                  <td>
                    <strong>
                      {row.categoryLabel} · {row.city}
                    </strong>
                    <br />
                    {row.description.length > 140 ? `${row.description.slice(0, 140)}…` : row.description}
                    <br />
                    <small>Inviata il {formatAdminDate(row.requestCreatedAt)}</small>
                  </td>
                  <td>{row.clientAccountDeleted ? "Account eliminato" : (row.clientName ?? "—")}</td>
                  <td>{row.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </YStack>
  );
}
