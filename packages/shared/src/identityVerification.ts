import { z } from "zod";

/**
 * Verifica fiscale e d'identità del professionista (docs/CHANGELOG.md §253,
 * decisioni dell'utente del 14/10/2026):
 * 1. dati fiscali compilati e controllati gratis (formato, coerenza del
 *    codice fiscale con nome e data di nascita);
 * 2. codice fiscale e partita IVA verificati (VIES e Openapi, §254): da qui
 *    il profilo è pubblico;
 * 3. documento e selfie (Didit): obbligatori prima di inviare preventivi, e
 *    danno il badge "Verificato". L'admin guarda solo i casi dubbi.
 */

/** Versione del testo di consenso al selfie: cambiandolo si chiede di nuovo. */
export const BIOMETRIC_CONSENT_VERSION = "2026-10-20";

/**
 * Consenso esplicito al trattamento del volto (GDPR art. 9), mostrato accanto
 * al pulsante con il link all'informativa. Accorciato a una frase su richiesta
 * dell'utente (docs/CHANGELOG.md §272): chi fa la verifica (Didit) e cosa
 * conserviamo (solo l'esito) sono scritti sotto il pulsante e nell'informativa.
 */
export function biometricConsentText(): string {
  return "Acconsento al confronto del mio volto con la foto del documento, solo per verificare la mia identità.";
}

export const startIdentityVerificationSchema = z.object({
  biometricConsent: z.literal(true, { errorMap: () => ({ message: "Per continuare spunta il consenso al confronto del selfie." }) }),
});
export type StartIdentityVerificationInput = z.infer<typeof startIdentityVerificationSchema>;

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
  /** Passo 2: verifica di codice fiscale e partita IVA. */
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
    /** Il servizio di verifica non rispondeva: in attesa, avvisiamo noi appena si può continuare (§256). */
    standby: boolean;
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

/**
 * Titolo del passo 2 secondo i dati da verificare (decisione dell'utente,
 * §254: parole semplici, senza nominare enti che possano intimorire).
 */
export function taxIdStepTitle(kinds: TaxIdKind[]): string {
  const hasVat = kinds.includes("PARTITA_IVA");
  const hasCf = kinds.includes("CODICE_FISCALE");
  if (hasVat && hasCf) return "Verifica codice fiscale e P.IVA";
  if (hasVat) return "Verifica P.IVA";
  if (hasCf) return "Verifica codice fiscale";
  return "Verifica dati fiscali";
}

/** Frase per lo stato di una verifica di codice fiscale o partita IVA. */
export function taxIdCheckMessage(check: Pick<TaxIdCheckView, "kind" | "status" | "detail">): string {
  const label = TAX_ID_KIND_LABEL[check.kind];
  const isVat = check.kind === "PARTITA_IVA";
  switch (check.status) {
    case "VALID":
      return isVat ? "Partita IVA attiva." : `${label} verificato.`;
    case "INVALID":
      return isVat
        ? `La partita IVA risulta ${check.detail ? check.detail.toLowerCase() : "non attiva"}: controlla il numero o scrivici se è un errore.`
        : `Non riusciamo a verificare il ${label.charAt(0).toLowerCase()}${label.slice(1)}: controlla di averlo scritto bene.`;
    case "REVIEW":
      // P.IVA giusta nella forma ma non nel registro delle imprese (es. libero
      // professionista): non blocca e non passa all'admin (§255).
      return `${label}: numero corretto.`;
    default:
      return `${label}: verifica in corso, intanto il profilo resta visibile.`;
  }
}

/** Messaggio dell'API quando manca la verifica dell'identità per inviare un preventivo. */
export const IDENTITY_REQUIRED_FOR_QUOTES_MESSAGE =
  "Prima di inviare il tuo primo preventivo verifica la tua identità: servono un documento e un selfie, circa 2 minuti. La trovi in Verifica identità.";
