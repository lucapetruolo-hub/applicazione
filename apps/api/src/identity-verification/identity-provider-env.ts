import { DiditIdentityProvider } from "./didit.provider";
import type { IdentityProvider } from "./identity-provider";

/** Il fornitore configurato su questo ambiente (chiavi su Render), o `null`. */
export function identityProviderFromEnv(): IdentityProvider | null {
  const apiKey = process.env.DIDIT_API_KEY?.trim();
  const workflowId = process.env.DIDIT_WORKFLOW_ID?.trim();
  if (!apiKey || !workflowId) return null;
  return new DiditIdentityProvider(apiKey, workflowId, process.env.DIDIT_WEBHOOK_SECRET?.trim() || null);
}

/**
 * Documento e selfie obbligatori prima di inviare preventivi (decisione
 * dell'utente, docs/CHANGELOG.md §259): solo dove la verifica è attiva,
 * altrimenti nessuno potrebbe più lavorare. I profili dimostrativi e quelli
 * già verificati a mano restano liberi.
 */
export function identityVerificationRequired(): boolean {
  return Boolean(process.env.DIDIT_API_KEY?.trim() && process.env.DIDIT_WORKFLOW_ID?.trim());
}

export function identityVerificationNeeded(profile: { isDemo: boolean; verified: boolean }): boolean {
  return identityVerificationRequired() && !profile.isDemo && !profile.verified;
}
