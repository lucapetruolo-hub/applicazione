"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { AdminTrends } from "@professionisti/api-client";
import { adminCan, type AdminScope, type SiteAdvice, type UrgencyMetrics } from "@professionisti/shared";
import { Icon, Text, YStack, brand } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/lib/AuthContext";
import { AdminTrendTile } from "@/components/admin/AdminTrendTile";
import { useAdminOverview } from "@/components/admin/AdminOverviewContext";
import { AdminPageHeader, formatAdminDate } from "@/components/admin/adminUi";
import { SiteAdviceList } from "@/components/admin/SiteAdviceList";
import { SkeletonSummaryRow } from "@/components/Skeleton";

type TodoItem = { href: string; value: number; label: string; detail: string; scope: AdminScope; urgent?: boolean };

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
  // Consigli della settimana (docs/CHANGELOG.md §372): in Home per il super admin.
  const isSuper = adminCan(adminRoles, "SUPER");
  const [advice, setAdvice] = useState<SiteAdvice[] | null>(null);

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

  useEffect(() => {
    if (!token || !isSuper) return;
    apiClient
      .adminSiteStats(token)
      .then((stats) => setAdvice(stats.advice))
      .catch(() => setAdvice(null));
  }, [token, isSuper]);

  // Tutto quello che c'è da fare in un solo elenco, prima le scadenze
  // (richiesta di Luca del 28/10/2026, docs/changelog/2026-10-28-stripe-prova.md):
  // l'admin non deve aprire le pagine una per una per scoprirlo.
  const todo: TodoItem[] = (
    overview
      ? [
          {
            href: "/admin/pagamenti",
            value: overview.bankDisputesToAnswer,
            label: "Contestazioni in banca da rispondere",
            detail: overview.nextBankDisputeDueBy ? `La prima scade il ${formatAdminDate(overview.nextBankDisputeDueBy)}: senza prove la banca dà ragione al cliente.` : "Manda le prove prima della scadenza.",
            scope: "FINANCE" as AdminScope,
            urgent: true,
          },
          { href: "/admin/problemi", value: overview.openJobIssues, label: "Problemi sul lavoro da decidere", detail: "Segnalazioni dei clienti su un lavoro.", scope: "ANY" as AdminScope, urgent: true },
          { href: "/admin/problemi", value: overview.jobIssueAppeals, label: "Ricorsi dei professionisti", detail: "Su segnalazioni già accolte.", scope: "ANY" as AdminScope },
          { href: "/admin/pagamenti", value: overview.pendingRefunds, label: "Rimborsi da decidere", detail: "Il cliente aspetta i soldi.", scope: "FINANCE" as AdminScope, urgent: true },
          { href: "/admin/pagamenti", value: overview.openDisputes, label: "Contestazioni di pagamento", detail: "Tra cliente e professionista, da chiudere.", scope: "FINANCE" as AdminScope },
          { href: "/admin/pagamenti", value: overview.unpaidBalances, label: "Saldi non pagati", detail: "Clienti da sollecitare.", scope: "FINANCE" as AdminScope },
          { href: "/admin/finanza", value: overview.sdiRejectedInvoices, label: "Fatture scartate dallo SdI", detail: "Da correggere e rimandare.", scope: "FINANCE" as AdminScope, urgent: true },
          { href: "/admin/segnalazioni", value: overview.openReports, label: "Segnalazioni di contenuti", detail: "Profili, recensioni o messaggi da valutare.", scope: "MODERATION" as AdminScope },
          { href: "/admin/segnalazioni?vista=ricorsi", value: overview.pendingAppeals, label: "Ricorsi su decisioni di moderazione", detail: "Chi è stato colpito chiede di rivedere.", scope: "MODERATION" as AdminScope },
          { href: "/admin/richieste-da-seguire", value: overview.openProblemTakeovers, label: "Richieste da seguire", detail: "Clienti che hanno scelto «Ce ne occupiamo noi».", scope: "MODERATION" as AdminScope },
          { href: "/admin/messaggi", value: overview.openMessages, label: "Messaggi di contatto", detail: "Dal modulo Contatti, da rispondere.", scope: "MODERATION" as AdminScope },
          { href: "/admin/verifiche", value: overview.verificationRequests, label: "Verifiche dei profili", detail: "Professionisti che hanno chiesto la verifica.", scope: "MODERATION" as AdminScope },
          { href: "/admin/richieste-generali", value: overview.closedGeneralRequestZones, label: "Zone con le richieste generali chiuse", detail: "Da riaprire quando ci sono professionisti.", scope: "MODERATION" as AdminScope },
        ]
      : []
  ).filter((item) => adminCan(adminRoles, item.scope) && item.value > 0);
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
        ) : todo.length === 0 ? (
          <Text color={brand.grafite70}>Niente da gestire: tutto in ordine.</Text>
        ) : (
          <ul className="admin-todo">
            {todo.map((item) => (
              <li key={item.label}>
                <Link href={item.href} className="admin-todo-row">
                  <span className={`admin-todo-count${item.urgent ? " is-urgent" : ""}`}>{item.value}</span>
                  <span className="admin-todo-text">
                    <span className="admin-todo-label">{item.label}</span>
                    <span className="admin-todo-detail">{item.detail}</span>
                  </span>
                  <Icon name="chevron-right" size={18} color={brand.grafite70} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </YStack>

      {isSuper && advice ? (
        <YStack gap="$3">
          <Text fontFamily="$heading" fontWeight="800" fontSize="$6" color={brand.grafite}>
            Cosa fare questa settimana
          </Text>
          <SiteAdviceList advice={advice} limit={3} />
        </YStack>
      ) : null}

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
