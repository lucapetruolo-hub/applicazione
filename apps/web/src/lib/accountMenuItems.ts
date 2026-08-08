export type AccountMenuItem = { href: string; label: string };

export function getAccountMenuItems(role: "CLIENT" | "PROFESSIONAL" | "ADMIN"): AccountMenuItem[] {
  return role === "PROFESSIONAL"
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
