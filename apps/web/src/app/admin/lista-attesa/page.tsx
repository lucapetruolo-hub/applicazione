"use client";

import { useEffect, useState } from "react";
import { Button, Text, YStack, brand } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/lib/AuthContext";
import { AdminPageHeader, downloadTextFile, errorMessage, formatAdminDate } from "@/components/admin/adminUi";
import { SkeletonTableRows } from "@/components/Skeleton";

/** Email raccolte dal riquadro "Arriviamo presto nella tua zona" in homepage. */
export default function AdminListaAttesaPage() {
  const { token } = useAuth();
  const [rows, setRows] = useState<{ email: string; createdAt: string }[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    apiClient
      .adminListWaitlist(token)
      .then(setRows)
      .catch((err) => setError(errorMessage(err)));
  }, [token]);

  return (
    <YStack>
      <AdminPageHeader
        title="Lista d'attesa"
        description='Iscritti al riquadro "Arriviamo presto nella tua zona" della homepage.'
        right={
          rows && rows.length > 0 ? (
            <Button
              variant="secondary"
              size="$3"
              onPress={() =>
                token &&
                apiClient
                  .adminDownloadCsv(token, "waitlist")
                  .then((csv) => downloadTextFile("lista-attesa.csv", csv))
                  .catch((err) => setError(errorMessage(err)))
              }
            >
              Esporta CSV
            </Button>
          ) : null
        }
      />
      {error ? <Text color={brand.urgenza}>{error}</Text> : null}
      {rows === null && !error ? (
        <SkeletonTableRows rows={4} cols={2} />
      ) : rows && rows.length === 0 ? (
        <Text color={brand.grafite70}>Nessuna email raccolta finora.</Text>
      ) : rows ? (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Email</th>
                <th>Iscritto il</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.email}>
                  <td>{row.email}</td>
                  <td>{formatAdminDate(row.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </YStack>
  );
}
