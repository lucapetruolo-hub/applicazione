import { z } from "zod";

/**
 * Verifica fiscale e d'identità del professionista (docs/CHANGELOG.md §243,
 * decisioni dell'utente del 14/10/2026):
 * 1. dati fiscali compilati e controllati gratis (formato, coerenza del
 *    codice fiscale con nome e data di nascita);
 * 2. codice fiscale e partita IVA controllati all'Agenzia delle Entrate e al
 *    Registro Imprese (Openapi): da qui il profilo è pubblico;
 * 3. documento e selfie (Didit): obbligatori prima di inviare preventivi, e
 *    danno il badge "Verificato". L'admin guarda solo i casi dubbi.
 */

/** Versione del testo di consenso al selfie: cambiandolo si chiede di nuovo. */
export const BIOMETRIC_CONSENT_VERSION = "2026-10-14";

/** Consenso esplicito al trattamento del volto (GDPR art. 9), mostrato accanto al pulsante. */
export function biometricConsentText(brandName: string): string {
  return (
    `Acconsento che Didit, per conto di ${brandName}, confronti il mio volto con la foto del documento d'identità, ` +
    "al solo scopo di verificare che io sia la persona dei dati fiscali. Foto e selfie restano a Didit e vengono cancellati " +
    `secondo l'informativa privacy; ${brandName} conserva solo l'esito.`
  );
}

export const startIdentityVerificationSchema = z.object({
  biometricConsent: z.literal(true, { errorMap: () => ({ message: "Per continuare spunta il consenso al confronto del selfie." }) }),
});
export type StartIdentityVerificationInput = z.infer<typeof startIdentityVerificationSchema>;

export const declineIdentityVerificationSchema = z.object({
  note: z.string().trim().min(3, "Scrivi cosa deve correggere: arriva al professionista.").max(500),
});
export type DeclineIdentityVerificationInput = z.infer<typeof declineIdentityVerificationSchema>;

export type TaxIdKind = "CODICE_FISCALE" | "PARTITA_IVA";
export type TaxIdCheckStatus = "PENDING" | "VALID" | "INVALID" | "REVIEW";

export type TaxIdCheckView = {
  kind: TaxIdKind;
  value: string;
  status: TaxIdCheckStatus;
  /** Esito leggibile: es. "ATTIVA", "CESSATA". */
  detail: string | null;
  officialName: string | null;
  checkedAt: string | null;
};

export type IdentityVerificationStep = "NOT_STARTED" | "STARTED" | "PROCESSING" | "APPROVED" | "NEEDS_REVIEW" | "DECLINED" | "EXPIRED";

/** Stato dei tre passi, per la pagina Verifica e per i banner. */
export type MyVerificationStatus = {
  /** Azienda: il documento è quello del legale rappresentante. */
  isBusiness: boolean;
  /** Passo 1: dati fiscali compilati; `fiscalMissing` dice cosa manca. */
  fiscalDataComplete: boolean;
  fiscalMissing: string[];
  /** Passo 2: controllo all'Agenzia delle Entrate. */
  taxIdState: "NOT_NEEDED" | "CHECKING" | "OK" | "TO_FIX";
  taxIdChecks: TaxIdCheckView[];
  /** Passo 3: documento e selfie. */
  identity: {
    /** La verifica dell'identità è attiva su questo ambiente (chiavi del fornitore su Render). */
    available: boolean;
    status: IdentityVerificationStep;
    /** Perché è stata rifiutata o è in controllo, in parole semplici. */
    reason: string | null;
    updatedAt: string | null;
    /** Si può iniziare (o ripetere) adesso. */
    canStart: boolean;
    /** Se non si può iniziare, perché. */
    blockedReason: string | null;
  };
  /** Badge "Verificato". */
  verified: boolean;
  /** Il profilo compare nelle ricerche (per quanto riguarda i dati fiscali). */
  publicVisible: boolean;
  /** Può inviare preventivi (per quanto riguarda la verifica). */
  canSendQuotes: boolean;
};

export const TAX_ID_KIND_LABEL: Record<TaxIdKind, string> = {
  CODICE_FISCALE: "Codice fiscale",
  PARTITA_IVA: "Partita IVA",
};

/** Frase per lo stato di un controllo all'Agenzia delle Entrate / Registro Imprese. */
export function taxIdCheckMessage(check: Pick<TaxIdCheckView, "kind" | "status" | "detail">): string {
  const label = TAX_ID_KIND_LABEL[check.kind];
  switch (check.status) {
    case "VALID":
      return check.kind === "CODICE_FISCALE" ? "Codice fiscale confermato dall'Agenzia delle Entrate." : "Partita IVA attiva.";
    case "INVALID":
      return check.kind === "CODICE_FISCALE"
        ? "L'Agenzia delle Entrate non trova questo codice fiscale: controlla di averlo scritto bene."
        : `La partita IVA risulta ${check.detail ? check.detail.toLowerCase() : "non attiva"}: controlla il numero o scrivici se è un errore.`;
    case "REVIEW":
      return `${label} non trovata nel registro: la controlliamo noi, intanto il profilo resta visibile.`;
    default:
      return `${label} in controllo: ci vuole poco, il profilo intanto resta visibile.`;
  }
}

/** Messaggio dell'API quando manca la verifica dell'identità per inviare un preventivo. */
export const IDENTITY_REQUIRED_FOR_QUOTES_MESSAGE =
  "Prima di inviare il tuo primo preventivo verifica la tua identità: servono un documento e un selfie, circa 2 minuti. La trovi in Verifica identità.";
