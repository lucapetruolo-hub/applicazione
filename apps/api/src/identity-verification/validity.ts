import type { IdentityVerification } from "@professionisti/database";

/** Senza data di scadenza letta dal documento, la verifica vale 5 anni (§337). */
export const VERIFICATION_VALID_YEARS = 5;

/** Fino a quando vale una verifica approvata: scadenza del documento, o 5 anni senza data (§337). */
export function verificationValidUntil(approved: Pick<IdentityVerification, "decidedAt" | "createdAt" | "documentExpiresAt">): Date {
  if (approved.documentExpiresAt) return approved.documentExpiresAt;
  const from = approved.decidedAt ?? approved.createdAt;
  return new Date(Date.UTC(from.getUTCFullYear() + VERIFICATION_VALID_YEARS, from.getUTCMonth(), from.getUTCDate()));
}
