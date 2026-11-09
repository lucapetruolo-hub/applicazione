import { isInviteCode } from "@professionisti/shared";

/**
 * Codice del link d'invito "Porta un collega" o di un partner
 * (docs/changelog/2026-11-09-passaparola.md): salvato da
 * `TrafficSourceTracker` quando l'indirizzo ha `?invito=`, nella scheda del
 * browser e fino alla sua chiusura (solo tecnico, nessun consenso), e
 * mandato con la registrazione di un professionista.
 */
export const INVITE_CODE_STORAGE_KEY = "invite_code";

export function storedInviteCode(): string | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const value = window.sessionStorage.getItem(INVITE_CODE_STORAGE_KEY);
    return value && isInviteCode(value) ? value : undefined;
  } catch {
    return undefined;
  }
}
