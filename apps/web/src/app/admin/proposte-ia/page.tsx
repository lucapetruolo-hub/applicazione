"use client";

import { useEffect, useState } from "react";
import { CASE_ADVICE_DECISION_LABEL, CASE_ADVICE_KIND_LABEL, type CaseAdviceDecision, type CaseAdviceOverview } from "@professionisti/shared";
import { Text, YStack, brand } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/lib/AuthContext";
import { AdminPageHeader, errorMessage, formatAdminDate } from "@/components/admin/adminUi";
import { SkeletonTableRows } from "@/components/Skeleton";

const decisionLabel = (d: string) => CASE_ADVICE_DECISION_LABEL[d as CaseAdviceDecision] ?? d;

/**
 * Impostazioni → Proposte del computer (docs/changelog/2026-11-13-admin-ia-propone.md):
 * per ogni tipo di caso quante proposte l'admin ha deciso così come erano e
 * quante ha cambiato, con gli ultimi casi cambiati per migliorare le istruzioni.
 */
export default function AdminProposteIaPage() {
  const { token } = useAuth();
  const [data, setData] = useState<CaseAdviceOverview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    apiClient
      .adminCaseAdvice(token)
      .then(setData)
      .catch((err) => setError(errorMessage(err)));
  }, [token]);

  const disagreements = data?.kinds.flatMap((k) => k.disagreements.map((d) => ({ ...d, kind: k.kind }))).sort((a, b) => b.decidedAt.localeCompare(a.decidedAt)) ?? [];

  return (
    <YStack gap="5">
      <AdminPageHeader
        title="Proposte del computer"
        description="In ogni caso il computer propone una decisione. Tu la approvi o la cambi. Qui vedi quante volte hai deciso come lui, sulle ultime 100 decisioni di ogni tipo."
      />
      {error ? <Text color={brand.urgenza}>{error}</Text> : null}
      {data && !data.active ? (
        <Text fontWeight="700" color={brand.urgenza}>
          Le proposte sono spente: manca la chiave sul server. I casi si decidono a mano come sempre.
        </Text>
      ) : null}

      {!data && !error ? (
        <SkeletonTableRows rows={6} cols={3} />
      ) : data ? (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Tipo di caso</th>
                <th>Approvate così</th>
                <th>Cambiate</th>
              </tr>
            </thead>
            <tbody>
              {data.kinds.map((k) => (
                <tr key={k.kind}>
                  <td data-label="Tipo di caso">{CASE_ADVICE_KIND_LABEL[k.kind]}</td>
                  <td data-label="Approvate così">{k.decided === 0 ? "Ancora nessuna decisione" : `${k.agreed} su ${k.decided} (${Math.round((k.agreed / k.decided) * 100)}%)`}</td>
                  <td data-label="Cambiate">{k.decided - k.agreed}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {disagreements.length > 0 ? (
        <YStack gap="2">
          <Text fontFamily="heading" fontWeight="700" fontSize="5" color={brand.grafite}>
            Ultime volte che hai deciso diversamente
          </Text>
          <Text fontSize={13} color={brand.grafite70}>
            Servono a migliorare le sue istruzioni.
          </Text>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Quando</th>
                  <th>Tipo</th>
                  <th>Il computer proponeva</th>
                  <th>Hai deciso</th>
                  <th>Perché lo proponeva</th>
                </tr>
              </thead>
              <tbody>
                {disagreements.map((d) => (
                  <tr key={`${d.kind}:${d.caseId}`}>
                    <td data-label="Quando">{formatAdminDate(d.decidedAt)}</td>
                    <td data-label="Tipo">{CASE_ADVICE_KIND_LABEL[d.kind]}</td>
                    <td data-label="Il computer proponeva">{decisionLabel(d.advice)}</td>
                    <td data-label="Hai deciso">{decisionLabel(d.admin)}</td>
                    <td data-label="Perché lo proponeva">{d.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </YStack>
      ) : null}
    </YStack>
  );
}
