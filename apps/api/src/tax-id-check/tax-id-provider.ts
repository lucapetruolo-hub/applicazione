/**
 * Fornitore del controllo di codice fiscale e partita IVA (docs/CHANGELOG.md
 * §243). Oggi Openapi; per cambiarlo basta un'altra classe con questa forma,
 * scelta in `taxIdProviderFromEnv`.
 */
export type TaxIdLookup =
  /** Esiste (CF) o è attiva (P.IVA). */
  | { outcome: "VALID"; detail?: string | null; officialName?: string | null }
  /** Inesistente (CF) o cessata (P.IVA): il dato va corretto. */
  | { outcome: "INVALID"; detail?: string | null; officialName?: string | null }
  /** Non trovata nel registro, o stato particolare (sospesa, in liquidazione): la guarda un admin. */
  | { outcome: "REVIEW"; detail?: string | null; officialName?: string | null };

/** Il servizio non ha risposto (rete, credito esaurito, errore suo): si riprova più tardi, senza bloccare. */
export class TaxIdProviderUnavailableError extends Error {}

export interface TaxIdProvider {
  readonly name: string;
  checkCodiceFiscale(codiceFiscale: string): Promise<TaxIdLookup>;
  checkPartitaIva(vatNumber: string): Promise<TaxIdLookup>;
}
