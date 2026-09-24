"use client";

import Link from "next/link";
import { Text, YStack, brand } from "@professionisti/ui";
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

  const todo = overview
    ? [
        { href: "/admin/segnalazioni", value: overview.openReports, label: "Segnalazioni da gestire" },
        { href: "/admin/segnalazioni?vista=ricorsi", value: overview.pendingAppeals, label: "Contestazioni di decisioni" },
        { href: "/admin/messaggi", value: overview.openMessages, label: "Messaggi di contatto" },
        { href: "/admin/pagamenti", value: overview.pendingRefunds, label: "Rimborsi da decidere" },
        { href: "/admin/pagamenti", value: overview.openDisputes, label: "Contestazioni di pagamento" },
      ]
    : [];
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
  const nothingToDo = overview !== null && todo.every((item) => item.value === 0);

  return (
    <YStack gap="$6">
      <AdminPageHeader title="Home" description="Cosa c'è da gestire oggi e i numeri principali del sito." />

      <YStack gap="$3">
        <Text fontFamily="$heading" fontWeight="800" fontSize="$6" color={brand.grafite}>
          Da fare
        </Text>
        {overview === null ? (
          <YStack backgroundColor={brand.calce} borderRadius={16} overflow="hidden">
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
