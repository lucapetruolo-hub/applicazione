"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@professionisti/ui";
import { useAuth } from "@/lib/AuthContext";
import { CLIENT_TABS, PROFESSIONAL_NAV, isNavItemActive } from "@/lib/accountMenuItems";
import { accountMenuUnreadCounts } from "@/lib/notificationSections";

/**
 * Guscio comune delle pagine personali (docs/CHANGELOG.md §147, decisione
 * esplicita dell'utente): per il professionista un menu a sezioni come
 * quello dell'area admin (colonna a sinistra da 1000px, barra scorrevole
 * su telefono), per il cliente una barra di schede sotto l'header. Senza
 * accesso le pagine mostrano da sole il loro invito ad accedere.
 */
export function AccountShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, isLoading, unreadNotifications } = useAuth();
  if (isLoading || !user) return <>{children}</>;

  const counts = accountMenuUnreadCounts(user.isProfessional, unreadNotifications);

  if (user.isProfessional) {
    return (
      <div className="acct-shell">
        <nav className="acct-nav" aria-label="Sezioni del tuo account">
          {PROFESSIONAL_NAV.map((group) => (
            <div key={group.title} className="acct-nav-group">
              <span className="acct-nav-title">{group.title}</span>
              {group.items.map((item) => {
                const active = isNavItemActive(item, pathname);
                const count = counts[item.href] ?? 0;
                return (
                  <Link key={item.href} href={item.href} className={`acct-nav-link${active ? " is-active" : ""}`} aria-current={active ? "page" : undefined}>
                    <Icon name={item.icon} size={16} color={active ? "#ffffff" : "#6e6459"} />
                    <span>{item.label}</span>
                    {count > 0 ? <span className="acct-nav-badge">{count > 9 ? "9+" : count}</span> : null}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
        <main className="acct-main">{children}</main>
      </div>
    );
  }

  return (
    <div className="acct-client">
      <nav className="acct-tabs" aria-label="Sezioni del tuo account">
        {CLIENT_TABS.map((item) => {
          const active = isNavItemActive(item, pathname);
          const count = counts[item.href] ?? 0;
          return (
            <Link key={item.href} href={item.href} className={`acct-tab${active ? " is-active" : ""}`} aria-current={active ? "page" : undefined}>
              <Icon name={item.icon} size={16} color={active ? "#ffffff" : "#6e6459"} />
              <span>{item.label}</span>
              {count > 0 ? <span className="acct-nav-badge">{count > 9 ? "9+" : count}</span> : null}
            </Link>
          );
        })}
      </nav>
      {children}
    </div>
  );
}
