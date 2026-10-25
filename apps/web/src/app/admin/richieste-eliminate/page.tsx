"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { AdminClientDeletedRequest, AdminHiddenLead } from "@professionisti/api-client";
import { Text, YStack, brand } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/lib/AuthContext";
import { AdminPageHeader, errorMessage, formatAdminDate } from "@/components/admin/adminUi";
import { SkeletonTableRows } from "@/components/Skeleton";

/**
 * Richieste eliminate: dai clienti (nascoste a loro, cancellate dopo 90
 * giorni se non segnalate, docs/CHANGELOG.md §340) e dai professionisti
 * (nascoste a loro, mai cancellate, §143).
 */
export default function AdminRichiesteEliminatePage() {
  const { token } = useAuth();
  const [rows, setRows] = useState<AdminHiddenLead[] | null>(null);
  const [clientRows, setClientRows] = useState<AdminClientDeletedRequest[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    apiClient
      .adminListHiddenLeads(token)
      .then(setRows)
      .catch((err) => setError(errorMessage(err)));
    apiClient
      .adminListClientDeletedRequests(token)
      .then(setClientRows)
      .catch((err) => setError(errorMessage(err)));
  }, [token]);

  return (
    <YStack gap="$5">
      <AdminPageHeader title="Richieste eliminate" description="Tolte dalla lista di un cliente o di un professionista. Qui restano con chat e preventivi." />
      {error ? <Text color={brand.urgenza}>{error}</Text> : null}

      <YStack gap="$2">
        <Text fontFamily="$heading" fontWeight="700" fontSize="$5" color={brand.grafite}>
          Dai clienti
        </Text>
        <Text fontSize={14} color={brand.grafite70}>
          I professionisti le vedono &quot;Ritirata dal cliente&quot;. Si cancellano dopo 90 giorni, tranne quelle segnalate.
        </Text>
        {clientRows === null && !error ? (
          <SkeletonTableRows rows={3} cols={5} />
        ) : clientRows && clientRows.length === 0 ? (
          <Text color={brand.grafite70}>Nessuna richiesta eliminata da un cliente.</Text>
        ) : clientRows ? (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Eliminata il</th>
                  <th>Richiesta</th>
                  <th>Cliente</th>
                  <th>Motivo</th>
                  <th>Professionisti</th>
                  <th>Cancellazione</th>
                </tr>
              </thead>
              <tbody>
                {clientRows.map((row) => (
                  <tr key={row.guidedRequestId}>
                    <td>{formatAdminDate(row.deletedAt)}</td>
                    <td>
                      <strong>
                        {row.categoryLabel} · {row.city}
                      </strong>
                      <br />
                      {row.description.length > 140 ? `${row.description.slice(0, 140)}…` : row.description}
                      <br />
                      <small>
                        Inviata il {formatAdminDate(row.requestCreatedAt)}
                        {row.wasOpen ? "" : " · già chiusa"}
                      </small>
                    </td>
                    <td>{row.clientAccountDeleted ? "Account eliminato" : (row.clientName ?? "—")}</td>
                    <td>{row.reasonLabel ?? "—"}</td>
                    <td>
                      {row.professionalsReached} {row.professionalsReached === 1 ? "raggiunto" : "raggiunti"}
                      <br />
                      <small>
                        {row.quotes} {row.quotes === 1 ? "preventivo" : "preventivi"} · {row.messages} {row.messages === 1 ? "messaggio" : "messaggi"}
                      </small>
                    </td>
                    <td>
                      {row.reports > 0 ? (
                        <Link href="/admin/segnalazioni">
                          <strong>
                            Tenuta: segnalata
                            {row.openReports > 0 ? " (aperta)" : ""}
                          </strong>
                        </Link>
                      ) : row.purgeAt ? (
                        formatAdminDate(row.purgeAt)
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </YStack>

      <YStack gap="$2">
        <Text fontFamily="$heading" fontWeight="700" fontSize="$5" color={brand.grafite}>
          Dai professionisti
        </Text>
        <Text fontSize={14} color={brand.grafite70}>
          Tolte dalla lista &quot;Richieste e lavori&quot; di un professionista, mai cancellate: il cliente continua a vederle.
        </Text>
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
    </YStack>
  );
}
