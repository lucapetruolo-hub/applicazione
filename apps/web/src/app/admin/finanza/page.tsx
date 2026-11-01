"use client";

import { useEffect, useState } from "react";
import type {
  AdminFinanceSummary,
  PlatformFeeRule,
} from "@professionisti/api-client";
import { H2, Text, XStack, YStack, brand } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/lib/AuthContext";
import { SkeletonBlock, SkeletonTableRows } from "@/components/Skeleton";
import { AdminInvoicesSection } from "@/components/admin/AdminInvoicesSection";
import { BRAND, formatEurCents } from "@professionisti/shared";

/**
 * Fisco e fatture → Le nostre fatture (CLAUDE.md §88, docs/CHANGELOG.md §378):
 * riepilogo dei ricavi, fatture ai professionisti e regole di commissione.
 * DAC7 ha la sua scheda (/admin/finanza/dac7) dal riordino del 30/10/2026
 * (docs/changelog/2026-10-30-admin-riordino.md): prima era tutto in una pagina.
 */
/**
 * Stati e fonti in italiano (docs/CHANGELOG.md §349): è la pagina da far vedere
 * al commercialista, "PENDING / CONFIRMED" non diceva nulla.
 */
const REVENUE_SOURCE_LABEL: Record<string, string> = {
  JOB_COMMISSION: "Trattenute sui lavori (IVA esclusa)",
  SUBSCRIPTION: "Abbonamenti",
  VISIBILITY_BOOST: "Pacchetti di visibilità",
  LEAD: "Richieste a pagamento",
};
const JOB_PAYMENT_STATUS_LABEL: Record<string, string> = {
  PENDING: "Non ancora pagati",
  AWAITING_CONFIRMATION: "In attesa di conferma del cliente",
  CONFIRMED: "Confermati",
  DISPUTED: "Contestati",
  REFUNDED: "Rimborsati",
  FAILED: "Non riusciti",
};

export default function AdminFinanzaPage() {
  const { token } = useAuth();
  const [finance, setFinance] = useState<AdminFinanceSummary | null>(null);
  const [feeRules, setFeeRules] = useState<PlatformFeeRule[] | null>(null);

  useEffect(() => {
    if (!token) return;
    apiClient
      .adminFinanceSummary(token)
      .then(setFinance)
      .catch(() => {});
    apiClient
      .adminListFeeRules(token)
      .then(setFeeRules)
      .catch(() => {});
  }, [token]);

  if (!token) return null;

  return (
    <YStack gap="$7">
      <YStack gap="$4">
        <H2 size="$7">Riepilogo finanza</H2>
        {finance === null ? (
          <YStack gap="$2" maxWidth={400}>
            <SkeletonBlock height={16} />
            <SkeletonBlock height={16} width="80%" />
            <SkeletonBlock height={16} width="60%" />
          </YStack>
        ) : (
          <YStack gap="$4">
            <YStack gap="$2">
              <Text fontWeight="700">Ricavo {BRAND.name} per fonte</Text>
              {finance.revenueBySource.length === 0 ? (
                <Text color={brand.grafite70}>
                  Nessun ricavo registrato finora.
                </Text>
              ) : (
                finance.revenueBySource.map((r) => (
                  <XStack
                    key={r.source}
                    justifyContent="space-between"
                    maxWidth={400}
                  >
                    <Text>{REVENUE_SOURCE_LABEL[r.source] ?? r.source}</Text>
                    <Text fontVariant={["tabular-nums"]}>
                      {formatEurCents(r.totalEurCents)}
                    </Text>
                  </XStack>
                ))
              )}
            </YStack>
            <YStack gap="$2">
              <Text fontWeight="700">Pagamenti del lavoro per metodo</Text>
              {finance.jobPaymentsByMethod.map((m) => (
                <XStack
                  key={m.method}
                  justifyContent="space-between"
                  maxWidth={400}
                >
                  <Text>
                    {m.method === "MANOVIA"
                      ? `Tramite ${BRAND.name}`
                      : "Diretti"}{" "}
                    ({m.count})
                  </Text>
                  <Text fontVariant={["tabular-nums"]}>
                    {formatEurCents(m.totalGrossEurCents)}
                  </Text>
                </XStack>
              ))}
            </YStack>
            <YStack gap="$2">
              <Text fontWeight="700">Pagamenti del lavoro per stato</Text>
              {finance.jobPaymentsByStatus.map((s) => (
                <XStack
                  key={s.status}
                  justifyContent="space-between"
                  maxWidth={400}
                >
                  <Text>{JOB_PAYMENT_STATUS_LABEL[s.status] ?? s.status}</Text>
                  <Text fontVariant={["tabular-nums"]}>{s.count}</Text>
                </XStack>
              ))}
            </YStack>
          </YStack>
        )}
      </YStack>

      {/* Le nostre fatture ai professionisti (docs/CHANGELOG.md §378). */}
      <AdminInvoicesSection token={token} />

      <YStack gap="$4">
        <XStack
          justifyContent="space-between"
          alignItems="center"
          flexWrap="wrap"
          gap="$3"
        >
          <H2 size="$7">Regole di commissione</H2>
          <Text fontSize={12} color={brand.grafite70}>
            Mai valori fissi nel codice — ogni regola è un dato, modificabile
            qui senza deploy.
          </Text>
        </XStack>
        {feeRules === null ? (
          <SkeletonTableRows rows={3} cols={7} />
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>% (IVA esclusa)</th>
                  <th>Fisso</th>
                  <th>Min/Max</th>
                  <th>Ambito</th>
                  <th>Attiva dal</th>
                  <th>Fino a</th>
                </tr>
              </thead>
              <tbody>
                {feeRules.map((rule) => (
                  <tr key={rule.id}>
                    <td>{rule.name}</td>
                    <td>{(rule.percentageBasisPoints / 100).toFixed(2)}%</td>
                    <td>{formatEurCents(rule.fixedFeeEurCents)}</td>
                    <td>
                      {rule.minFeeEurCents !== null
                        ? formatEurCents(rule.minFeeEurCents)
                        : "—"}{" "}
                      /{" "}
                      {rule.maxFeeEurCents !== null
                        ? formatEurCents(rule.maxFeeEurCents)
                        : "—"}
                    </td>
                    <td>
                      {rule.professionalProfileId
                        ? "Professionista specifico"
                        : rule.categoryId
                          ? "Categoria"
                          : "Globale"}
                    </td>
                    <td>
                      {new Date(rule.effectiveFrom).toLocaleDateString("it-IT")}
                    </td>
                    <td>
                      {rule.effectiveTo
                        ? new Date(rule.effectiveTo).toLocaleDateString("it-IT")
                        : "Attiva"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </YStack>
    </YStack>
  );
}
