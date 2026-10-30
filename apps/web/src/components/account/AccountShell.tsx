"use client";

import { useCallback, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@professionisti/ui";
import { useAuth } from "@/lib/AuthContext";
import { CLIENT_NAV, PROFESSIONAL_SIDEBAR, hasNavAttention, isNavItemActive, journeyNavItem } from "@/lib/accountMenuItems";
import { accountMenuUnreadCounts } from "@/lib/notificationSections";
import { useNavAttention } from "@/lib/useNavAttention";
import { apiClient } from "@/lib/apiClient";
import { applyNavPreference, useAccountNavCollapsed, useAccountNavKeys } from "@/lib/useAccountNavCollapsed";
import { useScrollMoreRight } from "@/lib/useScrollMoreRight";

/**
 * Guscio comune delle pagine personali (docs/CHANGELOG.md §147, decisione
 * esplicita dell'utente): un menu a sezioni come quello dell'area admin
 * (colonna a sinistra da 760px, riducibile a icone, barra scorrevole su
 * telefono), per il professionista e, dal §334, anche per il cliente. Senza
 * accesso le pagine mostrano da sole il loro invito ad accedere.
 */
export function AccountShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, token, isLoading, unreadNotifications } = useAuth();
  const attention = useNavAttention();
  const [collapsed, toggleCollapsedHere] = useAccountNavCollapsed();
  // Su telefono la barra sfuma a destra finché ci sono altre voci (§349).
  const navRef = useRef<HTMLElement>(null);
  const moreRight = useScrollMoreRight(navRef);
  // La scelta vale su tutti i dispositivi della persona (docs/CHANGELOG.md
  // §334): salvata sull'account, ripresa da lì all'accesso.
  const savedPreference = user?.sidebarCollapsed;
  useEffect(() => {
    if (typeof savedPreference === "boolean") applyNavPreference(savedPreference);
  }, [savedPreference]);
  const toggleCollapsed = useCallback(() => {
    const next = toggleCollapsedHere();
    if (token) apiClient.updatePreferences(token, { sidebarCollapsed: next }).catch(() => {});
  }, [toggleCollapsedHere, token]);
  useAccountNavKeys(toggleCollapsed);
  // Nell'area professionista il menu c'è già mentre si carica l'accesso:
  // prima compariva dopo e spingeva giù la pagina (A1 della verifica,
  // docs/CHANGELOG.md §310).
  const professionalArea = pathname.startsWith("/dashboard");
  // Altrove (es. Messaggi, cliente o professionista) si tiene lo spazio dello
  // schermo mentre si carica l'accesso: il piè di pagina compariva in alto e
  // poi veniva spinto giù (CLS 0,38, docs/CHANGELOG.md §334).
  if (!user && isLoading && !professionalArea) return <div style={{ minHeight: "100vh" }}>{children}</div>;
  if (!user && !(isLoading && professionalArea)) return <>{children}</>;

  const isProfessional = user ? user.isProfessional : professionalArea;
  const counts = accountMenuUnreadCounts(isProfessional, unreadNotifications);

  const journeyItem = isProfessional ? journeyNavItem(attention) : null;
  const groups = !isProfessional ? CLIENT_NAV : journeyItem ? [...PROFESSIONAL_SIDEBAR, { title: "Da completare", items: [journeyItem] }] : PROFESSIONAL_SIDEBAR;
  return (
    <div className="acct-shell">
      <nav ref={navRef} className="acct-nav" aria-label="Sezioni del tuo account" data-more-right={moreRight ? "true" : undefined}>
        {/* Riduce il menu a sole icone (da 1000px, docs/CHANGELOG.md §334):
            il nome della voce compare passando sopra o col tasto Tab. */}
        <button type="button" className="acct-nav-toggle" onClick={toggleCollapsed} aria-expanded={!collapsed} aria-keyshortcuts="[" aria-label={collapsed ? "Espandi il menu" : "Riduci il menu a icone"}>
          <Icon name={collapsed ? "chevron-right" : "chevron-left"} size={16} color="#6e6459" />
          <span className="acct-nav-tip" aria-hidden="true">
            {collapsed ? "Espandi il menu" : "Riduci il menu"} <kbd>[</kbd>
          </span>
        </button>
        {groups.map((group) => (
          <div key={group.title} className="acct-nav-group">
            <span className="acct-nav-title">{group.title}</span>
            {group.items.map((item) => {
              const active = isNavItemActive(item, pathname);
              const count = counts[item.href] ?? 0;
              return (
                <Link key={item.href} href={item.href} className={`acct-nav-link${active ? " is-active" : ""}`} aria-current={active ? "page" : undefined}>
                  <Icon name={item.icon} size={16} color={active ? "#2b2420" : "#6e6459"} />
                  <span className="acct-nav-label">{item.label}</span>
                  <span className="acct-nav-short" aria-hidden="true">{item.shortLabel ?? item.label}</span>
                  {count > 0 ? <span className="acct-nav-badge">{count > 9 ? "9+" : count}</span> : hasNavAttention(item, attention) ? <span className="acct-nav-dot" role="img" aria-label="Da completare" /> : null}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
      {/* Il contenuto principale (<main>) è già quello del sito: qui un secondo era doppio (collaudo L-11). */}
      <div className="acct-main">{children}</div>
    </div>
  );
}
