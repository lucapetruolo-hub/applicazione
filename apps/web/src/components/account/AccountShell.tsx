"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@professionisti/ui";
import { useAuth } from "@/lib/AuthContext";
import { CLIENT_TABS, PROFESSIONAL_NAV, isNavItemActive } from "@/lib/accountMenuItems";
import { accountMenuUnreadCounts } from "@/lib/notificationSections";
import { useNavAttention } from "@/lib/useNavAttention";

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
  const attention = useNavAttention();
  // Nell'area professionista il menu c'è già mentre si carica l'accesso:
  // prima compariva dopo e spingeva giù la pagina (A1 della verifica,
  // docs/CHANGELOG.md §305).
  const professionalArea = pathname.startsWith("/dashboard");
  if (!user && !(isLoading && professionalArea)) return <>{children}</>;

  const isProfessional = user ? user.isProfessional : professionalArea;
  const counts = accountMenuUnreadCounts(isProfessional, unreadNotifications);

  if (isProfessional) {
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
                    {count > 0 ? <span className="acct-nav-badge">{count > 9 ? "9+" : count}</span> : attention.has(item.href) ? <span className="acct-nav-dot" role="img" aria-label="Da completare" /> : null}
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
