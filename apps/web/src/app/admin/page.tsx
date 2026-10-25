"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { AdminTrends } from "@professionisti/api-client";
import { adminCan, type AdminScope, type UrgencyMetrics } from "@professionisti/shared";
import { Text, YStack, brand } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/lib/AuthContext";
import { AdminTrendTile } from "@/components/admin/AdminTrendTile";
import { useAdminOverview } from "@/components/admin/AdminOverviewContext";
import { AdminPageHeader } from "@/components/admin/adminUi";
import { SkeletonSummaryRow } from "@/components/Skeleton";

/**
 * Home dell'area admin (docs/CHANGELOG.md §144): prima di tutto cosa c'è da
 * fare oggi, poi i numeri della piattaforma — come la Home di Shopify o
 * l'Overview di Vercel. Ogni riquadro porta alla lista corrispondente.
 */
export default function AdminHomePage() {
  const { overview } = useAdminOverview();
  const { user, token } = useAuth();
  const adminRoles = user?.adminRoles ?? [];
  const [trends, setTrends] = useState<AdminTrends | null>(null);
  const [urgency, setUrgency] = useState<UrgencyMetrics | null>(null);

  useEffect(() => {
    if (!token) return;
    apiClient
      .adminTrends(token)
      .then(setTrends)
      .catch(() => setTrends(null));
    apiClient
      .adminUrgencyMetrics(token)
      .then(setUrgency)
      .catch(() => setUrgency(null));
  }, [token]);

  const todo = (
    overview
      ? [
          { href: "/admin/segnalazioni", value: overview.openReports, label: "Segnalazioni da gestire", scope: "MODERATION" as AdminScope },
          { href: "/admin/segnalazioni?vista=ricorsi", value: overview.pendingAppeals, label: "Contestazioni di decisioni", scope: "MODERATION" as AdminScope },
          { href: "/admin/messaggi", value: overview.openMessages, label: "Messaggi di contatto", scope: "MODERATION" as AdminScope },
          { href: "/admin/pagamenti", value: overview.pendingRefunds, label: "Rimborsi da decidere", scope: "FINANCE" as AdminScope },
          { href: "/admin/pagamenti", value: overview.openDisputes, label: "Contestazioni di pagamento", scope: "FINANCE" as AdminScope },
        ]
      : []
  ).filter((item) => adminCan(adminRoles, item.scope));
  const numbers = overview
    ? [
        { href: "/admin/utenti?ruolo=CLIENT", value: overview.clients, label: "Clienti" },
        { href: "/admin/utenti?ruolo=PROFESSIONAL", value: overview.professionals, label: "Professionisti" },
        { href: "/admin/utenti", value: overview.newUsers7d, label: "Nuovi iscritti (7 giorni)" },
        { href: "/admin/utenti?stato=suspended", value: overview.suspendedUsers, label: "Account sospesi" },
        { href: "/admin/richieste-eliminate", value: overview.hiddenLeads, label: "Richieste eliminate dai professionisti" },
        { href: "/admin/lista-attesa", value: overview.waitlist, label: "Iscritti alla lista d'attesa" },
      ]
    : [];
  // Richieste urgenti (docs/CHANGELOG.md §340): avviso agli admin ogni lunedì se fuori soglia.
  const minutes = (value: number | null) => (value === null ? "—" : value < 120 ? `${value} min` : `${Math.round(value / 60)} ore`);
  const urgencyNumbers = urgency
    ? [
        { value: urgency.urgentShare === null ? "—" : `${Math.round(urgency.urgentShare * 100)}%`, label: `Richieste urgenti (${urgency.urgent} su ${urgency.requests})` },
        { value: minutes(urgency.urgentMedianMinutesToFirstQuote), label: "Primo preventivo, urgenti" },
        { value: minutes(urgency.standardMedianMinutesToFirstQuote), label: "Primo preventivo, normali" },
        { value: String(urgency.urgentWithoutRecipients), label: "Urgenti senza destinatari", urgent: urgency.urgentWithoutRecipients > 0 },
      ]
    : [];
  const nothingToDo = overview !== null && todo.every((item) => item.value === 0);

  return (
    <YStack gap="$6">
      <AdminPageHeader title="Home" description="Cosa c'è da gestire oggi e i numeri principali del sito." />

      <YStack gap="$3">
        <Text fontFamily="$heading" fontWeight="800" fontSize="$6" color={brand.grafite}>
          Da fare
        </Text>
        {overview === null ? (
          <YStack backgroundColor={brand.calce} borderRadius={20} overflow="hidden">
            <SkeletonSummaryRow />
          </YStack>
        ) : nothingToDo ? (
          <Text color={brand.grafite70}>Niente da gestire: tutto in ordine.</Text>
        ) : (
          <div className="admin-kpi-grid">
            {todo.map((item) => (
              <Link key={item.label} href={item.href} className={`admin-kpi${item.value > 0 ? " is-urgent" : ""}`}>
                <span className="admin-kpi-value">{item.value}</span>
                <span className="admin-kpi-label">{item.label}</span>
              </Link>
            ))}
          </div>
        )}
      </YStack>

      <YStack gap="$3">
        <Text fontFamily="$heading" fontWeight="800" fontSize="$6" color={brand.grafite}>
          Andamento (ultime 12 settimane)
        </Text>
        {trends ? (
          <div className="admin-kpi-grid admin-trend-grid">
            <AdminTrendTile label="Nuovi clienti" values={trends.series.newClients} weekStarts={trends.weekStarts} />
            <AdminTrendTile label="Nuovi professionisti" values={trends.series.newProfessionals} weekStarts={trends.weekStarts} />
            <AdminTrendTile label="Richieste di preventivo" values={trends.series.requests} weekStarts={trends.weekStarts} />
            <AdminTrendTile label="Interventi prenotati" values={trends.series.bookings} weekStarts={trends.weekStarts} />
            <AdminTrendTile label="Segnalazioni ricevute" values={trends.series.reports} weekStarts={trends.weekStarts} />
          </div>
        ) : (
          <Text color={brand.grafite70}>Caricamento…</Text>
        )}
      </YStack>

      {urgency ? (
        <YStack gap="$3">
          <Text fontFamily="$heading" fontWeight="800" fontSize="$6" color={brand.grafite}>
            Richieste urgenti (ultimi 7 giorni)
          </Text>
          {urgency.alerts.map((alert) => (
            <Text key={alert} color={brand.urgenza}>
              {alert}
            </Text>
          ))}
          <div className="admin-kpi-grid">
            {urgencyNumbers.map((item) => (
              <div key={item.label} className={`admin-kpi${item.urgent ? " is-urgent" : ""}`}>
                <span className="admin-kpi-value">{item.value}</span>
                <span className="admin-kpi-label">{item.label}</span>
              </div>
            ))}
          </div>
        </YStack>
      ) : null}

      <YStack gap="$3">
        <Text fontFamily="$heading" fontWeight="800" fontSize="$6" color={brand.grafite}>
          Numeri
        </Text>
        {overview === null ? null : (
          <div className="admin-kpi-grid">
            {numbers.map((item) => (
              <Link key={item.label} href={item.href} className="admin-kpi">
                <span className="admin-kpi-value">{item.value}</span>
                <span className="admin-kpi-label">{item.label}</span>
              </Link>
            ))}
          </div>
        )}
      </YStack>
    </YStack>
  );
}
