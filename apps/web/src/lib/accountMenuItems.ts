import type { IconName } from "@professionisti/ui";

export type AccountNavItem = {
  href: string;
  label: string;
  icon: IconName;
  /** Nome breve sotto l'icona nella colonna stretta del tablet. */
  shortLabel?: string;
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
      // Seconda: sul telefono la barra è scorrevole e l'Agenda, la voce più
      // usata in giro, finiva tagliata a destra (T12, docs/CHANGELOG.md §311).
      { href: "/dashboard/agenda", label: "Agenda", icon: "calendar" },
      { href: "/dashboard/richieste", label: "Richieste e lavori", shortLabel: "Richieste", icon: "file-text" },
      { href: "/chat", label: "Messaggi", icon: "message-circle" },
    ],
  },
  {
    title: "La tua attività",
    items: [
      { href: "/dashboard/profilo", label: "Profilo pubblico", shortLabel: "Profilo", icon: "user-round" },
      // Dati fiscali controllati, documento e selfie (docs/CHANGELOG.md §253).
      { href: "/dashboard/verifica-identita", label: "Verifica identità", shortLabel: "Verifica", icon: "badge-check" },
      { href: "/dashboard/statistiche", label: "Statistiche", icon: "trending-up" },
      { href: "/dashboard/abbonamento", label: "Abbonamento", icon: "credit-card" },
    ],
  },
  {
    title: "Impostazioni",
    items: [
      { href: "/account", label: "Account", icon: "shield" },
      { href: "/account/notifiche", label: "Notifiche", icon: "bell-ring" },
      // Area a schede: dati fiscali, pagamenti online, fatture e documenti,
      // compensi al fisco (docs/changelog/2026-10-28-fisco-e-pagamenti-schede.md).
      { href: "/dashboard/fiscale", label: "Fisco e pagamenti", shortLabel: "Fisco", icon: "coins", alsoMatches: ["/dashboard/documenti"] },
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
      { href: "/le-mie-recensioni", label: "Le mie recensioni", icon: "star" },
    ],
  },
];

/**
 * Voci del menu laterale (docs/CHANGELOG.md §334, richiesta esplicita
 * dell'utente: al massimo 8 icone nella colonna ridotta). Restano le voci
 * di tutti i giorni; impostazioni, dati fiscali e pagine da cliente vivono
 * nella tendina "Il mio account" (`PROFESSIONAL_NAV`). In più una voce
 * "Da completare" solo finché c'è un passo del percorso profilo da fare
 * (`journeyNavItem`).
 */
const SIDEBAR_HREFS = new Set(["/dashboard", "/dashboard/agenda", "/dashboard/richieste", "/chat", "/dashboard/profilo", "/dashboard/statistiche", "/dashboard/abbonamento"]);
export const PROFESSIONAL_SIDEBAR: AccountNavGroup[] = PROFESSIONAL_NAV.map((group) => ({
  ...group,
  items: group.items.filter((item) => SIDEBAR_HREFS.has(item.href)),
})).filter((group) => group.items.length > 0);

/** Voce del passo da fare del percorso profilo, se fuori dal menu laterale. */
export function journeyNavItem(attention: ReadonlySet<string>): AccountNavItem | null {
  for (const group of PROFESSIONAL_NAV) {
    for (const item of group.items) {
      if (!SIDEBAR_HREFS.has(item.href) && hasNavAttention(item, attention)) return item;
    }
  }
  return null;
}

/**
 * Menu laterale del cliente, come quello del professionista (richiesta
 * dell'utente, docs/CHANGELOG.md §334: prima una barra di schede sotto
 * l'header, §147). Stesse voci della tendina "Il mio account". La pagina di
 * una decisione sui propri contenuti (/segnalazioni) non è nel menu, si apre
 * dall'email (docs/CHANGELOG.md §319): nessuna voce evidenziata, perché
 * nessuna è la pagina in cui sei (§349; prima restava accesa "Account").
 */
export const CLIENT_NAV: AccountNavGroup[] = [
  {
    title: "Le tue richieste",
    items: [
      { href: "/le-mie-richieste", label: "Le mie richieste", shortLabel: "Richieste", icon: "file-text" },
      { href: "/chat", label: "Messaggi", icon: "message-circle" },
      { href: "/professionisti-salvati", label: "Professionisti salvati", shortLabel: "Salvati", icon: "heart" },
      { href: "/le-mie-recensioni", label: "Le mie recensioni", shortLabel: "Recensioni", icon: "star" },
    ],
  },
  {
    title: "Impostazioni",
    items: [
      { href: "/account", label: "Account", icon: "user-round" },
      { href: "/account/notifiche", label: "Notifiche", icon: "bell-ring" },
    ],
  },
];

/**
 * Gruppi della tendina "Il mio account" nell'header (docs/CHANGELOG.md
 * §148, richiesta esplicita dell'utente: "suddividi meglio anche quel menu
 * a tendina"): gli stessi dei menu laterali.
 */
export function getAccountMenuGroups(isProfessional: boolean): AccountNavGroup[] {
  return isProfessional ? PROFESSIONAL_NAV : CLIENT_NAV;
}

/** La voce è quella della pagina corrente? `/dashboard` solo in modo esatto. */
export function isNavItemActive(item: AccountNavItem, pathname: string): boolean {
  const matches = [item.href, ...(item.alsoMatches ?? [])];
  // `/dashboard` e `/account` solo esatti: le loro sottopagine hanno una voce propria.
  return matches.some((href) => (href === "/dashboard" || href === "/account" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`)));
}

/**
 * La voce ha un passo "da fare" (pallino rosso)? Anche quando il passo è in
 * una sua sottopagina, come i pagamenti online in `/dashboard/fiscale/pagamenti`
 * (docs/changelog/2026-10-28-fisco-e-pagamenti-schede.md): il pallino sul
 * passo facoltativo dei pagamenti resta, decisione di Luca (§334).
 */
export function hasNavAttention(item: AccountNavItem, attention: ReadonlySet<string>): boolean {
  for (const href of attention) if (isNavItemActive(item, href)) return true;
  return false;
}

