"use client";

import { useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { AdminOverview, AdminRoleName } from "@professionisti/api-client";
import { adminCan, type AdminScope } from "@professionisti/shared";
import { Icon, type IconName } from "@professionisti/ui";
import { useScrollMoreRight } from "@/lib/useScrollMoreRight";

type NavItem = {
  href: string;
  /** Nome della scheda dentro la sezione. */
  label: string;
  /** Nome per la ricerca ⌘K e per il menu da telefono del sito, se diverso. */
  searchLabel?: string;
  icon: IconName;
  scope: AdminScope;
  badge?: (o: AdminOverview) => number;
};

type NavSection = { key: string; label: string; icon: IconName; tabs: NavItem[] };

/**
 * Le 8 sezioni dell'area admin, ognuna con le sue schede (riordino del
 * 30/10/2026, docs/changelog/2026-10-30-admin-riordino.md): prima le voci
 * erano 21, una dopo l'altra. I gruppi vengono dal card sorting e dal tree
 * test in analisi/admin-riordino/. Gli indirizzi delle pagine non cambiano:
 * cambia solo dove stanno nel menu.
 */
export const ADMIN_SECTIONS: NavSection[] = [
  {
    key: "da-fare",
    label: "Da fare",
    icon: "bell-ring",
    tabs: [{ href: "/admin", label: "Da fare", icon: "bell-ring", scope: "ANY" }],
  },
  {
    key: "persone",
    label: "Persone",
    icon: "user-round",
    tabs: [
      { href: "/admin/utenti", label: "Utenti", icon: "user-round", scope: "ANY" },
      { href: "/admin/professionisti", label: "Nuovo professionista", icon: "plus", scope: "MODERATION" },
      { href: "/admin/verifiche", label: "Verifiche", searchLabel: "Verifiche dei profili", icon: "badge-check", scope: "MODERATION", badge: (o) => o.verificationRequests },
    ],
  },
  {
    key: "reclami",
    label: "Reclami e segnalazioni",
    icon: "flag",
    tabs: [
      { href: "/admin/problemi", label: "Problemi sul lavoro", icon: "wrench", scope: "ANY", badge: (o) => o.openJobIssues + o.jobIssueAppeals },
      { href: "/admin/segnalazioni", label: "Segnalazioni di contenuti", icon: "flag", scope: "MODERATION", badge: (o) => o.openReports + o.pendingAppeals },
      { href: "/admin/chat", label: "Chat", searchLabel: "Chat tra clienti e professionisti", icon: "message-circle", scope: "MODERATION" },
    ],
  },
  {
    key: "richieste",
    label: "Richieste",
    icon: "send",
    tabs: [
      { href: "/admin/richieste-da-seguire", label: "Ce ne occupiamo noi", icon: "heart-handshake", scope: "MODERATION", badge: (o) => o.openProblemTakeovers },
      { href: "/admin/messaggi", label: "Messaggi dal sito", icon: "mail", scope: "MODERATION", badge: (o) => o.openMessages },
      { href: "/admin/richieste-generali", label: "Zone e richieste generali", icon: "map-pin", scope: "MODERATION", badge: (o) => o.closedGeneralRequestZones },
      { href: "/admin/richieste-eliminate", label: "Richieste eliminate", icon: "trash-2", scope: "MODERATION" },
    ],
  },
  {
    key: "soldi",
    label: "Soldi",
    icon: "credit-card",
    tabs: [
      {
        href: "/admin/pagamenti",
        label: "Pagamenti e rimborsi",
        icon: "credit-card",
        scope: "FINANCE",
        badge: (o) => o.pendingRefunds + o.openDisputes + o.unpaidBalances + o.bankDisputesToAnswer,
      },
      { href: "/admin/lavori", label: "Lavori chiusi", searchLabel: "Lavori chiusi e importi finali", icon: "check", scope: "ANY" },
      { href: "/admin/documenti-clienti", label: "Documenti ai clienti", icon: "receipt-text", scope: "ANY" },
      { href: "/admin/whatsapp", label: "Costi WhatsApp", icon: "smartphone", scope: "FINANCE" },
    ],
  },
  {
    key: "fisco",
    label: "Fisco e fatture",
    icon: "landmark",
    tabs: [
      { href: "/admin/finanza", label: "Le nostre fatture", icon: "file-text", scope: "FINANCE", badge: (o) => o.sdiRejectedInvoices },
      { href: "/admin/finanza/dac7", label: "DAC7", searchLabel: "DAC7: compensi dei professionisti al fisco", icon: "landmark", scope: "FINANCE" },
    ],
  },
  {
    key: "numeri",
    label: "Numeri",
    icon: "trending-up",
    tabs: [
      { href: "/admin/andamento", label: "Andamento e consigli", icon: "lightbulb", scope: "ANY" },
      { href: "/admin/numeri-professionisti", label: "Professionisti e ricerche", icon: "briefcase", scope: "ANY" },
      { href: "/admin/statistiche", label: "Entrate", searchLabel: "Entrate e visite", icon: "coins", scope: "FINANCE" },
    ],
  },
  {
    key: "impostazioni",
    label: "Impostazioni",
    icon: "sliders-horizontal",
    tabs: [
      { href: "/admin/amministratori", label: "Amministratori", icon: "shield", scope: "SUPER" },
      { href: "/admin/account-di-prova", label: "Account di prova", icon: "sparkles", scope: "SUPER" },
      { href: "/admin/mestieri-richiesti", label: "Dizionario dei mestieri", icon: "search", scope: "MODERATION" },
      { href: "/admin/registro", label: "Registro azioni", icon: "file-text", scope: "SUPER" },
    ],
  },
];

/** Tutte le pagine in un elenco (ricerca ⌘K, menu da telefono del sito, permessi del guscio). */
export const ADMIN_NAV_ITEMS: NavItem[] = ADMIN_SECTIONS.flatMap((section) =>
  section.tabs.map((tab) => ({ ...tab, label: tab.searchLabel ?? (section.tabs.length > 1 ? tab.label : section.label) })),
);

function tabMatches(href: string, pathname: string): boolean {
  return href === "/admin" ? pathname === "/admin" : pathname === href || pathname.startsWith(`${href}/`);
}

/** La scheda dell'indirizzo: la più lunga che corrisponde (es. /admin/finanza/dac7 prima di /admin/finanza). */
export function adminTabFor(pathname: string): { section: NavSection; tab: NavItem } | null {
  let best: { section: NavSection; tab: NavItem } | null = null;
  for (const section of ADMIN_SECTIONS) {
    for (const tab of section.tabs) {
      if (tabMatches(tab.href, pathname) && (!best || tab.href.length > best.tab.href.length)) best = { section, tab };
    }
  }
  return best;
}

const visibleTabs = (section: NavSection, roles: AdminRoleName[]) => section.tabs.filter((tab) => adminCan(roles, tab.scope));
const countOf = (tabs: NavItem[], overview: AdminOverview | null) => (overview ? tabs.reduce((sum, tab) => sum + (tab.badge?.(overview) ?? 0), 0) : 0);

/**
 * Menu dell'area admin: colonna fissa a sinistra sopra i 1000px, barra
 * orizzontale scorrevole sotto (docs/CHANGELOG.md §144). Una voce per sezione,
 * con il numero delle cose da gestire di tutte le sue schede.
 */
export function AdminNav({ overview, adminRoles, onOpenSearch }: { overview: AdminOverview | null; adminRoles: AdminRoleName[]; onOpenSearch: () => void }) {
  const pathname = usePathname();
  const current = adminTabFor(pathname);
  // Su telefono la barra sfuma a destra finché ci sono altre sezioni (§349).
  const navRef = useRef<HTMLElement>(null);
  const moreRight = useScrollMoreRight(navRef);
  return (
    <nav ref={navRef} className="admin-nav" aria-label="Sezioni amministrazione" data-more-right={moreRight ? "true" : undefined}>
      <span className="admin-nav-title">Amministrazione</span>
      <button type="button" className="admin-nav-link admin-nav-search" onClick={onOpenSearch}>
        <Icon name="search" size={16} color="#6e6459" />
        <span>Cerca</span>
        <kbd className="admin-kbd">⌘K</kbd>
      </button>
      {ADMIN_SECTIONS.map((section) => {
        const tabs = visibleTabs(section, adminRoles);
        if (!tabs.length) return null;
        const active = current?.section.key === section.key;
        const count = countOf(tabs, overview);
        return (
          <Link key={section.key} href={tabs[0].href} className={`admin-nav-link${active ? " is-active" : ""}`} aria-current={active ? "page" : undefined}>
            <Icon name={section.icon} size={16} color={active ? "#2b2420" : "#6e6459"} />
            <span>{section.label}</span>
            {count > 0 ? <span className="admin-nav-badge">{count}</span> : null}
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * Titolo della sezione e le sue schede, sopra ogni pagina admin. Con una sola
 * scheda (Da fare) resta solo il titolo.
 */
export function AdminSectionTabs({ overview, adminRoles }: { overview: AdminOverview | null; adminRoles: AdminRoleName[] }) {
  const pathname = usePathname();
  const current = adminTabFor(pathname);
  if (!current) return null;
  const tabs = visibleTabs(current.section, adminRoles);
  return (
    <div className="admin-section-head">
      <h1 className="admin-section-title">{current.section.label}</h1>
      {tabs.length > 1 ? (
        <nav className="admin-tabs" aria-label={`Schede di ${current.section.label}`}>
          {tabs.map((tab) => {
            const active = tab.href === current.tab.href;
            const count = countOf([tab], overview);
            return (
              <Link key={tab.href} href={tab.href} className={`admin-tab${active ? " is-active" : ""}`} aria-current={active ? "page" : undefined}>
                {tab.label}
                {count > 0 ? <span className="admin-tab-count">{count}</span> : null}
              </Link>
            );
          })}
        </nav>
      ) : null}
    </div>
  );
}
