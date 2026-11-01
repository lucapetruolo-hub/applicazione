"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { AdminProfessionalWithoutCard } from "@professionisti/shared";
import { Text, YStack, brand } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";
import { AdminCard, errorMessage, formatAdminDate } from "@/components/admin/adminUi";

/**
 * Chi ha il profilo ma non ha dato la carta per i mesi gratis, da chiamare
 * (docs/changelog/2026-10-30-iscrizione-carta-solida.md). I più vecchi
 * prima, con i promemoria già partiti. Senza account di prova.
 */
export function WithoutCardCard({ token }: { token: string }) {
  const [rows, setRows] = useState<AdminProfessionalWithoutCard[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiClient
      .adminProfessionalsWithoutCard(token)
      .then(setRows)
      .catch((err) => setError(errorMessage(err)));
  }, [token]);

  if (error) {
    return (
      <AdminCard>
        <Text color={brand.urgenza}>{error}</Text>
      </AdminCard>
    );
  }
  if (!rows) return null;

  return (
    <AdminCard>
      <YStack gap="$1">
        <Text fontWeight="700" fontSize={18} color={brand.grafite}>
          Senza carta ({rows.length})
        </Text>
        <Text color={brand.grafite70} fontSize={14}>
          Hanno salvato il profilo ma non hanno dato la carta per i mesi gratis. Ricevono un promemoria il giorno dopo e dopo 3 giorni; poi conviene chiamarli.
        </Text>
      </YStack>
      {rows.length === 0 ? (
        <Text color={brand.grafite70}>Nessuno: tutti hanno dato la carta.</Text>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Professionista</th>
                <th>Telefono</th>
                <th>Email</th>
                <th>Profilo del</th>
                <th>Promemoria</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.userId}>
                  <td className="admin-cell-main">
                    <Link href={`/admin/utenti/${row.userId}`}>{row.businessName}</Link>
                    <br />
                    <span style={{ color: brand.grafite70, fontSize: 13 }}>{[row.name, row.city].filter(Boolean).join(" · ")}</span>
                  </td>
                  <td data-label="Telefono">{row.phone ? <a href={`tel:${row.phone}`}>{row.phone}</a> : "—"}</td>
                  <td data-label="Email">{row.email ? <a href={`mailto:${row.email}`}>{row.email}</a> : "—"}</td>
                  <td data-label="Profilo del">{formatAdminDate(row.profileCreatedAt)}</td>
                  <td data-label="Promemoria">{row.remindersSent === 0 ? "Nessuno" : row.remindersSent === 1 ? "1 mandato" : `${row.remindersSent} mandati`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AdminCard>
  );
}
