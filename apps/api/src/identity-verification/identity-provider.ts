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
  /** Codici degli avvisi del fornitore (es. documento sfocato, volto diverso): spiegano un rifiuto nei log e nel registro azioni. */
  warnings: string[];
  /** Scadenza del documento (AAAA-MM-GG), l'unico dato del documento che si conserva (§337). */
  documentExpiresAt?: string | null;
  /** Motivo per il professionista ricavato dagli avvisi (documento scaduto, foto sfocata…), o null se non ce n'è uno preciso. */
  reason: string | null;
};

/** Persona che ci aspettiamo sul documento, mandata al fornitore perché faccia anche lui il confronto. */
export type ExpectedDocumentPerson = { firstName: string | null; lastName: string | null; dateOfBirth: string | null };

export interface IdentityProvider {
  readonly name: string;
  /** Ambiente di prova del fornitore: i dati letti dal documento sono finti, il confronto con i dati fiscali si salta. */
  readonly sandbox: boolean;
  /** Pagina della console del fornitore dove l'admin vede il caso (null se non c'è un link diretto). */
  consoleUrl(sessionId: string): string | null;
  createSession(input: { reference: string; callbackUrl: string; expected?: ExpectedDocumentPerson }): Promise<{ sessionId: string; url: string }>;
  getDecision(sessionId: string): Promise<IdentityDecision>;
  /** Firma del webhook valida: torna l'id della sessione, altrimenti null. */
  verifyWebhook(rawBody: Buffer, headers: Record<string, string | string[] | undefined>, now?: Date): string | null;
}

export class IdentityProviderError extends Error {}
