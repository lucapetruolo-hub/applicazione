/**
 * Fornitore della verifica di documento e selfie (docs/CHANGELOG.md §253).
 * Oggi Didit; per cambiarlo (es. Stripe Identity) basta un'altra classe con
 * questa forma, scelta in `identityProviderFromEnv`. Il resto del sito parla
 * solo con questa interfaccia.
 */

/** Dati letti dal documento: usati solo per il confronto, mai salvati. */
export type DocumentPerson = {
  firstName: string | null;
  lastName: string | null;
  /** AAAA-MM-GG */
  dateOfBirth: string | null;
  /** Numero personale stampato sul documento: sulla CIE è il codice fiscale. */
  personalNumber: string | null;
};

export type IdentityDecision = {
  /** Stato grezzo del fornitore, per l'admin. */
  providerStatus: string;
  outcome: "IN_PROGRESS" | "PROCESSING" | "APPROVED" | "DECLINED" | "REVIEW" | "EXPIRED";
  person: DocumentPerson | null;
};

export interface IdentityProvider {
  readonly name: string;
  /** Pagina della console del fornitore dove l'admin vede il caso (null se non c'è un link diretto). */
  consoleUrl(sessionId: string): string | null;
  createSession(input: { reference: string; callbackUrl: string }): Promise<{ sessionId: string; url: string }>;
  getDecision(sessionId: string): Promise<IdentityDecision>;
  /** Firma del webhook valida: torna l'id della sessione, altrimenti null. */
  verifyWebhook(rawBody: Buffer, headers: Record<string, string | string[] | undefined>, now?: Date): string | null;
}

export class IdentityProviderError extends Error {}
