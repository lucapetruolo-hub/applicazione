"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { AdminTrends } from "@professionisti/api-client";
import type { UrgencyMetrics } from "@professionisti/shared";
import { Text, YStack, brand } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/lib/AuthContext";
import { AdminTrendTile } from "@/components/admin/AdminTrendTile";
import { useAdminOverview } from "@/components/admin/AdminOverviewContext";

/**
 * Andamento delle ultime 12 settimane, richieste urgenti e numeri principali:
 * erano in Home, ora stanno in Numeri → Andamento e consigli, così "Da fare"
 * resta solo la coda dei casi (docs/changelog/2026-10-30-admin-riordino.md).
 */
export function AdminSummaryNumbers() {
  const { overview } = useAdminOverview();
  const { token } = useAuth();
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

  const numbers = overview
    ? [
        { href: "/admin/utenti?ruolo=CLIENT", value: overview.clients, label: "Clienti" },
        { href: "/admin/numeri-professionisti", value: overview.professionals, label: "Professionisti" },
        { href: "/admin/utenti", value: overview.newUsers7d, label: "Nuovi iscritti (7 giorni)" },
        { href: "/admin/utenti?stato=suspended", value: overview.suspendedUsers, label: "Account sospesi" },
        { href: "/admin/richieste-eliminate", value: overview.hiddenLeads, label: "Richieste eliminate dai professionisti" },
      ]
    : [];
  // Richieste urgenti (docs/CHANGELOG.md §344): avviso agli admin ogni lunedì se fuori soglia.
  const minutes = (value: number | null) => (value === null ? "—" : value < 120 ? `${value} min` : `${Math.round(value / 60)} ore`);
  const urgencyNumbers = urgency
    ? [
        { value: urgency.urgentShare === null ? "—" : `${Math.round(urgency.urgentShare * 100)}%`, label: `Richieste urgenti (${urgency.urgent} su ${urgency.requests})` },
        { value: minutes(urgency.urgentMedianMinutesToFirstQuote), label: "Primo preventivo, urgenti" },
        { value: minutes(urgency.standardMedianMinutesToFirstQuote), label: "Primo preventivo, normali" },
        { value: String(urgency.urgentWithoutRecipients), label: "Urgenti senza destinatari", urgent: urgency.urgentWithoutRecipients > 0 },
      ]
    : [];

  return (
    <YStack gap="$5">
      {overview ? (
        <YStack gap="$3">
          <Text tag="h2" margin={0} fontFamily="$heading" fontWeight="800" fontSize="$6" color={brand.grafite}>
            In breve
          </Text>
          <div className="admin-kpi-grid">
            {numbers.map((item) => (
              <Link key={item.label} href={item.href} className="admin-kpi">
                <span className="admin-kpi-value">{item.value}</span>
                <span className="admin-kpi-label">{item.label}</span>
              </Link>
            ))}
          </div>
        </YStack>
      ) : null}

      <YStack gap="$3">
        <Text tag="h2" margin={0} fontFamily="$heading" fontWeight="800" fontSize="$6" color={brand.grafite}>
          Ultime 12 settimane
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
          <Text tag="h2" margin={0} fontFamily="$heading" fontWeight="800" fontSize="$6" color={brand.grafite}>
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
    </YStack>
  );
}
