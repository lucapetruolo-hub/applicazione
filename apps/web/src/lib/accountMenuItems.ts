import type { IconName } from "@professionisti/ui";

export type AccountNavItem = {
  href: string;
  label: string;
  icon: IconName;
  /** Altri percorsi che appartengono a questa voce (per evidenziarla). */
  alsoMatches?: string[];
};

export type AccountNavGroup = { title: string; items: AccountNavItem[] };

/**
 * Menu del professionista a sezioni (docs/CHANGELOG.md §147, decisione
 * esplicita dell'utente, che rimette un menu sempre visibile rispetto a
 * §45 ma nella forma dell'area admin): prima il lavoro di tutti i giorni,
 * poi la propria attività, le impostazioni e, separate, le pagine da
 * cliente. Unica fonte di verità per il menu laterale (`AccountShell`) e
 * per la tendina "Il mio account" dell'header (`getAccountMenuGroups`).
 *
 * `isProfessional` (da `CurrentUser`, non `role`) decide la voce mostrata:
 * un professionista promosso ad ADMIN mantiene il proprio profilo e deve
 * continuare a vedere il proprio menu (bug reale corretto in passato).
 */
export const PROFESSIONAL_NAV: AccountNavGroup[] = [
  {
    title: "Lavoro",
    items: [
      { href: "/dashboard", label: "Oggi", icon: "house" },
      { href: "/dashboard/richieste", label: "Richieste e lavori", icon: "file-text" },
      { href: "/chat", label: "Messaggi", icon: "message-circle" },
      { href: "/dashboard/agenda", label: "Agenda", icon: "calendar" },
    ],
  },
  {
    title: "La tua attività",
    items: [
      { href: "/dashboard/profilo", label: "Profilo e visibilità", icon: "user-round", alsoMatches: ["/dashboard/tipo-attivita"] },
      { href: "/dashboard/statistiche", label: "Statistiche", icon: "trending-up" },
    ],
  },
  {
    title: "Impostazioni",
    items: [
      { href: "/account", label: "Account", icon: "shield" },
      { href: "/account/notifiche", label: "Notifiche", icon: "bell-ring" },
      { href: "/dashboard/fiscale", label: "Dati fiscali e pagamenti", icon: "coins" },
      { href: "/segnalazioni", label: "Segnalazioni e decisioni", icon: "flag" },
    ],
  },
  {
    // Un professionista può anche cercare un altro servizio per sé
    // (richiesta esplicita dell'utente in passato): pagine da cliente,
    // separate dal lavoro.
    title: "Come cliente",
    items: [
      { href: "/le-mie-richieste", label: "Le mie richieste", icon: "briefcase" },
      { href: "/professionisti-salvati", label: "Professionisti salvati", icon: "heart" },
    ],
  },
];

/**
 * Schede del cliente (docs/CHANGELOG.md §147): poche voci, quindi una barra
 * sotto l'header invece di un menu laterale. "Segnalazioni e decisioni"
 * vive dentro Account.
 */
export const CLIENT_TABS: AccountNavItem[] = [
  { href: "/le-mie-richieste", label: "Richieste", icon: "file-text" },
  { href: "/chat", label: "Messaggi", icon: "message-circle" },
  { href: "/professionisti-salvati", label: "Salvati", icon: "heart" },
  { href: "/account", label: "Account", icon: "user-round", alsoMatches: ["/segnalazioni", "/account/notifiche"] },
];

/**
 * Gruppi della tendina "Il mio account" nell'header (docs/CHANGELOG.md
 * §148, richiesta esplicita dell'utente: "suddividi meglio anche quel menu
 * a tendina"). Professionista: stessi gruppi del menu laterale. Cliente:
 * le sue richieste, poi account e segnalazioni.
 */
export function getAccountMenuGroups(isProfessional: boolean): AccountNavGroup[] {
  if (isProfessional) return PROFESSIONAL_NAV;
  return [
    {
      title: "Le tue richieste",
      items: [
        { href: "/le-mie-richieste", label: "Le mie richieste", icon: "file-text" },
        { href: "/chat", label: "Messaggi", icon: "message-circle" },
        { href: "/professionisti-salvati", label: "Professionisti salvati", icon: "heart" },
      ],
    },
    {
      title: "Impostazioni",
      items: [
        { href: "/account", label: "Account", icon: "user-round" },
        { href: "/account/notifiche", label: "Notifiche", icon: "bell-ring" },
        { href: "/segnalazioni", label: "Segnalazioni e decisioni", icon: "flag" },
      ],
    },
  ];
}

/** La voce è quella della pagina corrente? `/dashboard` solo in modo esatto. */
export function isNavItemActive(item: AccountNavItem, pathname: string): boolean {
  const matches = [item.href, ...(item.alsoMatches ?? [])];
  // `/dashboard` e `/account` solo esatti: le loro sottopagine hanno una voce propria.
  return matches.some((href) => (href === "/dashboard" || href === "/account" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`)));
}
