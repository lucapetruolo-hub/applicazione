"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { AdminOverview } from "@professionisti/api-client";
import { Icon, type IconName } from "@professionisti/ui";

type NavItem = { href: string; label: string; icon: IconName; badge?: (o: AdminOverview) => number };

export const ADMIN_NAV_ITEMS: NavItem[] = [
  { href: "/admin", label: "Home", icon: "house" },
  { href: "/admin/segnalazioni", label: "Segnalazioni", icon: "flag", badge: (o) => o.openReports + o.pendingAppeals },
  { href: "/admin/messaggi", label: "Messaggi", icon: "mail", badge: (o) => o.openMessages },
  { href: "/admin/utenti", label: "Utenti", icon: "user-round" },
  { href: "/admin/pagamenti", label: "Rimborsi e contestazioni", icon: "credit-card", badge: (o) => o.pendingRefunds + o.openDisputes },
  { href: "/admin/richieste-eliminate", label: "Richieste eliminate", icon: "trash-2" },
  { href: "/admin/lista-attesa", label: "Lista d'attesa", icon: "clock" },
  { href: "/admin/finanza", label: "Finanza e DAC7", icon: "coins" },
  { href: "/admin/statistiche", label: "Statistiche", icon: "trending-up" },
];

/**
 * Menu dell'area admin (docs/CHANGELOG.md §144): colonna fissa a sinistra
 * sopra i 1000px, barra orizzontale scorrevole sotto — prima il menu
 * esisteva solo sopra i 1300px, su telefono e portatili piccoli non c'era
 * alcuna navigazione. I numeri rossi sono le cose ancora da gestire.
 */
export function AdminNav({ overview }: { overview: AdminOverview | null }) {
  const pathname = usePathname();
  return (
    <nav className="admin-nav" aria-label="Sezioni amministrazione">
      <span className="admin-nav-title">Amministrazione</span>
      {ADMIN_NAV_ITEMS.map((item) => {
        const active = item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);
        const count = overview && item.badge ? item.badge(overview) : 0;
        return (
          <Link key={item.href} href={item.href} className={`admin-nav-link${active ? " is-active" : ""}`} aria-current={active ? "page" : undefined}>
            <Icon name={item.icon} size={16} color={active ? "#ffffff" : "#6e6459"} />
            <span>{item.label}</span>
            {count > 0 ? <span className="admin-nav-badge">{count}</span> : null}
          </Link>
        );
      })}
    </nav>
  );
}
