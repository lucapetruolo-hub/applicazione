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

/** `null` su un admin vale come SUPER: nessun admin creato prima dei ruoli perde l'accesso. */
export function adminCan(adminRole: AdminRoleValue | null | undefined, scope: AdminScope): boolean {
  const role = adminRole ?? "SUPER";
  if (role === "SUPER" || scope === "ANY") return true;
  if (scope === "MODERATION") return role === "MODERATOR";
  if (scope === "FINANCE") return role === "FINANCE";
  return false;
}

/** Assegna o toglie il ruolo admin (`null` = non più admin). */
export const adminRoleUpdateSchema = z.object({ adminRole: z.enum(adminRoles).nullable() });
export type AdminRoleUpdateInput = z.infer<typeof adminRoleUpdateSchema>;
