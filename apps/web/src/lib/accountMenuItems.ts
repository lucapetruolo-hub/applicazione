export type AccountMenuItem = { href: string; label: string };

/**
 * `isProfessional` (da `CurrentUser`, non `role`) decide la voce mostrata:
 * un professionista promosso ad ADMIN mantiene il proprio profilo e deve
 * continuare a vedere Dashboard/Agenda/Profilo pubblico — bug reale
 * corretto, prima si guardava `role === "PROFESSIONAL"`, che sparisce
 * appena l'account diventa ADMIN pur restando titolare di un profilo.
 */
export function getAccountMenuItems(isProfessional: boolean): AccountMenuItem[] {
  return isProfessional
    ? [
        { href: "/dashboard", label: "Dashboard" },
        { href: "/dashboard/profilo", label: "Profilo pubblico" },
        { href: "/dashboard/agenda", label: "Agenda" },
        { href: "/account", label: "Impostazioni dell'account" },
      ]
    : [
        { href: "/account", label: "Impostazioni dell'account" },
        { href: "/professionisti-salvati", label: "Professionisti salvati" },
        { href: "/le-mie-richieste", label: "Le mie richieste" },
      ];
}
