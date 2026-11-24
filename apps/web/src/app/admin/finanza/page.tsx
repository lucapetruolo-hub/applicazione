"use client";

import { useEffect, useState } from "react";
import type { AdminFinanceSummary } from "@professionisti/api-client";
import { H2, Text, XStack, YStack, brand } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/lib/AuthContext";
import { SkeletonBlock } from "@/components/Skeleton";
import { AdminInvoicesSection } from "@/components/admin/AdminInvoicesSection";
import { BRAND, formatEurCents } from "@professionisti/shared";
import { WaitBarSignal } from "@/components/WaitBar";

/**
 * Fisco e fatture → Fatture emesse (CLAUDE.md §88, docs/CHANGELOG.md §378):
 * fatture ai professionisti e riepilogo dei ricavi. Dati della società,
 * commercialista e regole di commissione stanno in "Società e commercialista",
 * gli invii nel "Registro invii" (riordino del 24/11/2026,
 * docs/changelog/2026-11-24-fatture-del-mese-zip.md).
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

  useEffect(() => {
    if (!token) return;
    apiClient
      .adminFinanceSummary(token)
      .then(setFinance)
      .catch(() => {});
  }, [token]);

  if (!token) return null;

  return (
    <YStack gap="7">
      {/* Fatture emesse ai professionisti (docs/CHANGELOG.md §378). */}
      <AdminInvoicesSection token={token} view="invoices" />

      <YStack gap="4">
        <H2 size="7">Riepilogo finanza</H2>
        {finance === null ? (
          <YStack gap="2" maxWidth={400}>
            <SkeletonBlock height={16} />
            <SkeletonBlock height={16} width="80%" />
            <SkeletonBlock height={16} width="60%" />
            <WaitBarSignal />
          </YStack>
        ) : (
          <YStack gap="4">
            <YStack gap="2">
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
            <YStack gap="2">
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
            <YStack gap="2">
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


    </YStack>
  );
}
