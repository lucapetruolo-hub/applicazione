/**
 * Fornitore del controllo di codice fiscale e partita IVA (docs/CHANGELOG.md
 * §253-§254). Oggi VIES per la partita IVA e Openapi per il resto; per
 * cambiarlo basta un'altra classe con questa forma, scelta in
 * `taxIdProviderFromEnv`.
 */
type LookupFields = {
  detail?: string | null;
  officialName?: string | null;
  /** Chi ha dato l'esito, se diverso dal fornitore principale (es. "vies"). */
  source?: string;
};
export type TaxIdLookup =
  /** Esiste (CF) o è attiva (P.IVA). */
  | ({ outcome: "VALID" } & LookupFields)
  /** Inesistente (CF) o cessata (P.IVA): il dato va corretto. */
  | ({ outcome: "INVALID" } & LookupFields)
  /** Non trovata nel registro, o stato particolare (sospesa, in liquidazione): la guarda un admin. */
  | ({ outcome: "REVIEW" } & LookupFields);

/** Il servizio non ha risposto (rete, credito esaurito, errore suo): si riprova più tardi, senza bloccare. */
export class TaxIdProviderUnavailableError extends Error {}

export interface TaxIdProvider {
  readonly name: string;
  checkCodiceFiscale(codiceFiscale: string): Promise<TaxIdLookup>;
  checkPartitaIva(vatNumber: string): Promise<TaxIdLookup>;
}
