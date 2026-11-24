"use client";

import { useEffect, useState } from "react";
import type { FiscalSendRow } from "@professionisti/shared";
import { H2, Text, YStack, brand } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";
import { SkeletonTableRows } from "@/components/Skeleton";
import { AdminTabs, errorMessage, formatAdminDate } from "./adminUi";

type Filter = "all" | FiscalSendRow["kind"];

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "Tutti" },
  { key: "INVOICE", label: "Fatture al fisco" },
  { key: "ACCOUNTANT_ZIP", label: "Al commercialista" },
  { key: "SDI_TEST", label: "Prove" },
];

const OUTCOME_COLOR: Record<FiscalSendRow["outcome"], string> = {
  ok: brand.cianografiaScuro,
  waiting: brand.grafite70,
  error: brand.urgenza,
};

/**
 * Registro invii (Admin → Fisco e fatture, riordino del 24/11/2026,
 * docs/changelog/2026-11-24-fatture-del-mese-zip.md): ogni cosa partita verso
 * l'esterno, dal più recente. Le fatture vere allo SdI col loro esito, le prove
 * d'invio e gli zip al commercialista della società.
 */
export function AdminFiscalSendsSection({ token }: { token: string }) {
  const [rows, setRows] = useState<FiscalSendRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");

  useEffect(() => {
    apiClient
      .adminFiscalSends(token)
      .then(setRows)
      .catch((e) => setError(errorMessage(e)));
  }, [token]);

  const shown = rows?.filter((row) => filter === "all" || row.kind === filter) ?? null;

  return (
    <YStack gap="4">
      <H2 size="7">Registro invii</H2>
      <Text color={brand.grafite70}>
        Qui c&apos;è tutto quello che è partito. Le fatture al fisco con il loro esito, le fatture del mese al commercialista e le prove.
      </Text>
      <AdminTabs tabs={FILTERS} value={filter} onChange={setFilter} />
      {error ? <Text color={brand.urgenza}>{error}</Text> : null}
      {shown === null ? (
        error ? null : <SkeletonTableRows rows={4} cols={5} />
      ) : shown.length === 0 ? (
        <Text color={brand.grafite70}>Ancora nessun invio.</Text>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Quando</th>
                <th>Cosa</th>
                <th>A chi</th>
                <th>Esito</th>
                <th>Dettagli</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((row) => (
                <tr key={row.id}>
                  <td>{formatAdminDate(row.at, true)}</td>
                  <td className="admin-cell-main">
                    {row.what}
                    {row.manual ? " · a mano" : ""}
                  </td>
                  <td>{row.recipient ?? "—"}</td>
                  <td>
                    <Text color={OUTCOME_COLOR[row.outcome]} fontWeight="700">
                      {row.outcomeLabel}
                    </Text>
                  </td>
                  <td>
                    {[row.detail, row.externalId ? `Codice dell'invio ${row.externalId}` : null].filter(Boolean).join(" · ") || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </YStack>
  );
}
