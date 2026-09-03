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
        // Aggiunta esplicita (segnalata in revisione UX: "pagina orfana, non
        // raggiungibile da nessun menu") — la dashboard ora rimanda qui per
        // il dettaglio/le azioni sulle richieste ricevute, invece di
        // duplicarle in due punti diversi del sito.
        { href: "/dashboard/richieste", label: "Richieste ricevute" },
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
