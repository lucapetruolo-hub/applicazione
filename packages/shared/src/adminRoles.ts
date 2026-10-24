import { z } from "zod";

/**
 * Ruoli admin separati (docs/CHANGELOG.md §145): ogni area del pannello
 * appartiene a uno "scope", e un ruolo vede solo le aree del proprio scope.
 * Unica fonte di verità per server (AdminGuard) e menu admin.
 */
export const adminRoles = ["SUPER", "MODERATOR", "FINANCE"] as const;
export type AdminRoleValue = (typeof adminRoles)[number];

/** `ANY` = qualunque admin; `SUPER` = solo il super-admin (ruoli, registro). */
export type AdminScope = "ANY" | "MODERATION" | "FINANCE" | "SUPER";

export const ADMIN_ROLE_LABEL: Record<AdminRoleValue, string> = {
  SUPER: "Super admin",
  MODERATOR: "Moderatore",
  FINANCE: "Finanza",
};

export const ADMIN_ROLE_DESCRIPTION: Record<AdminRoleValue, string> = {
  SUPER: "Vede e gestisce tutto, assegna i ruoli admin.",
  MODERATOR: "Segnalazioni, messaggi, utenti, sospensioni.",
  FINANCE: "Finanza, DAC7, commissioni, rimborsi e contestazioni, statistiche.",
};

/**
 * Ruoli effettivi di un admin: combinabili (es. Moderatore + Finanza,
 * docs/CHANGELOG.md §146). Una lista vuota su un ADMIN vale come SUPER:
 * nessun admin creato prima dei ruoli perde l'accesso. SUPER da solo
 * assorbe gli altri.
 */
export function normalizeAdminRoles(roles: readonly AdminRoleValue[] | null | undefined): AdminRoleValue[] {
  const unique = adminRoles.filter((role) => roles?.includes(role));
  if (unique.length === 0 || unique.includes("SUPER")) return ["SUPER"];
  return unique;
}

export function adminCan(roles: readonly AdminRoleValue[] | null | undefined, scope: AdminScope): boolean {
  const effective = normalizeAdminRoles(roles);
  if (effective.includes("SUPER") || scope === "ANY") return true;
  if (scope === "MODERATION") return effective.includes("MODERATOR");
  if (scope === "FINANCE") return effective.includes("FINANCE");
  return false;
}

/** Etichetta leggibile dei ruoli, es. "Moderatore + Finanza". */
export function adminRolesLabel(roles: readonly AdminRoleValue[] | null | undefined): string {
  return normalizeAdminRoles(roles)
    .map((role) => ADMIN_ROLE_LABEL[role])
    .join(" + ");
}

/** Assegna o toglie i ruoli admin (lista vuota = non più admin). */
export const adminRoleUpdateSchema = z.object({ adminRoles: z.array(z.enum(adminRoles)).max(3) });
export type AdminRoleUpdateInput = z.infer<typeof adminRoleUpdateSchema>;
