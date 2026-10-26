/**
 * Frase leggibile per una riga del registro azioni admin (docs/CHANGELOG.md
 * §350, richiesta dell'utente): prima i valori salvati come JSON comparivano
 * grezzi ("{"paymentMethod":"DIRECT",...}") e le righe erano alte e vuote.
 * I valori restano integri nel database: qui si sceglie solo cosa dire.
 */

export const ACTION_SHORT_LABEL: Record<string, string> = {
  WARN: "avvertimento",
  REQUEST_CORRECTION: "richiesta di correzione",
  HIDE_CONTENT: "contenuto nascosto",
  SUSPEND_PROFILE: "profilo tolto dalla ricerca",
  SUSPEND_USER: "account sospeso",
};

const ROLE_SHORT_LABEL: Record<string, string> = {
  SUPER: "super admin",
  MODERATOR: "moderatore",
  FINANCE: "finanza",
  CLIENT: "cliente (non più admin)",
  PROFESSIONAL: "professionista (non più admin)",
};

/** Campi dei dati fiscali, come li vede il professionista nel modulo. */
const FISCAL_FIELD_LABEL: Record<string, string> = {
  entityType: "tipo di attività",
  fiscalFirstName: "nome",
  fiscalLastName: "cognome",
  fiscalCodiceFiscale: "codice fiscale",
  vatNumber: "partita IVA",
  dateOfBirth: "data di nascita",
  placeOfBirth: "luogo di nascita",
  registeredStreet: "via",
  registeredHouseNumber: "numero civico",
  registeredPostalCode: "CAP",
  registeredCity: "città",
  registeredProvince: "provincia",
  registeredCountry: "paese",
  taxResidenceCountry: "paese di residenza fiscale",
  companyName: "ragione sociale",
  pecAddress: "PEC",
  sdiCode: "codice destinatario",
};

const ENTITY_KIND_LABEL: Record<string, string> = {
  PRIVATE_INDIVIDUAL: "lavoro occasionale",
  SOLE_PROPRIETOR: "professionista con partita IVA",
  BUSINESS: "azienda",
};

const IDENTITY_STATUS_LABEL: Record<string, string> = {
  STARTED: "iniziata",
  PROCESSING: "in controllo",
  APPROVED: "approvata",
  NEEDS_REVIEW: "da guardare",
  DECLINED: "non riuscita",
  EXPIRED: "scaduta",
};

const FISCAL_STATUS_LABEL: Record<string, string> = {
  UNVERIFIED: "da verificare",
  PENDING_VERIFICATION: "in verifica",
  VERIFIED: "verificati",
  REJECTED: "rifiutati",
  REQUIRES_UPDATE: "da aggiornare",
};

const TAX_ID_OUTCOME_LABEL: Record<string, string> = {
  PENDING: "da ricontrollare",
  VALID: "valido",
  INVALID: "non valido",
  REVIEW: "non trovato nel registro",
};

const JOB_ISSUE_DECISION_LABEL: Record<string, string> = {
  UPHELD: "accolta",
  ACCEPTED: "accolta",
  REJECTED: "respinta",
};

const SANCTION_LABEL: Record<string, string> = {
  WARNING: "avvertimento",
  DEMOTED: "più in basso nella ricerca",
  BLOCKED: "richieste bloccate",
};

const STAGE_LABEL: Record<string, string> = {
  AWAITING_DEPOSIT: "in attesa dell'acconto",
  DEPOSIT_PAID: "acconto pagato",
  PAID: "pagato, soldi bloccati",
  RELEASED: "soldi sbloccati al professionista",
  REFUNDED: "rimborsato",
};

/** Il valore salvato è JSON (serialize di AuditLogService): torna l'oggetto, o il testo così com'è. */
function parse(value: string | null): unknown {
  if (value === null) return null;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asText(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "—";
}

function euro(cents: unknown): string | null {
  if (typeof cents !== "number" || !Number.isFinite(cents)) return null;
  const amount = cents / 100;
  return `${amount.toLocaleString("it-IT", { minimumFractionDigits: Number.isInteger(amount) ? 0 : 2, maximumFractionDigits: 2 })} €`;
}

function date(value: unknown): string {
  if (typeof value !== "string") return asText(value);
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Rome" });
}

function jobPaymentLabel(fieldName: string | null, value: unknown): string {
  const v = asRecord(value);
  switch (fieldName) {
    case null: {
      if (v.grossAmountEurCents !== undefined) return `Importo finale dichiarato${euro(v.grossAmountEurCents) ? `: ${euro(v.grossAmountEurCents)}` : ""} (pagamento diretto)`;
      if (v.paymentMethod === "DIRECT") return "Pagamento scelto: diretto al professionista";
      const deposit = euro(v.depositEurCents);
      return `Pagamento scelto: online${deposit ? `, acconto ${deposit}` : ""}${v.balanceDirect ? ", saldo diretto" : ""}`;
    }
    case "status":
      return value === "CONFIRMED" ? "Pagamento diretto confermato dal cliente" : `Stato del pagamento: ${asText(value)}`;
    case "depositPaidAt":
      return `Acconto pagato online${euro(v.amountEurCents) ? `: ${euro(v.amountEurCents)}` : ""}`;
    case "balancePaidAt":
      return `Saldo pagato online${euro(v.amountEurCents) ? `: ${euro(v.amountEurCents)}` : ""}`;
    case "balanceUnpaidAt":
      return "Saldo non pagato: segnalazione chiusa";
    case "depositKeptAt":
      return `Acconto trattenuto per annullamento tardivo${euro(v.keptEurCents) ? `: ${euro(v.keptEurCents)}` : ""}`;
    case "onlineStage": {
      const stage = typeof v.stage === "string" ? v.stage : asText(value);
      return `Pagamento online: ${STAGE_LABEL[stage] ?? stage}${euro(v.payout) ? `, ${euro(v.payout)} al professionista` : ""}`;
    }
    case "stripePayoutId":
      if (v.failureCode !== undefined || v.status === "failed") return "Bonifico al professionista non riuscito";
      return `Bonifico al professionista avviato${euro(v.amountEurCents) ? `: ${euro(v.amountEurCents)}` : ""}`;
    case "stripeDisputeStatus":
      return `Contestazione della carta: ${asText(v.status)}${euro(v.amountEurCents) ? `, ${euro(v.amountEurCents)}` : ""}`;
    case "disputeRecoveredEurCents":
      if (v.reinstated !== undefined) return `Contestazione vinta: ${euro(v.reinstated) ?? "importo"} restituito al professionista`;
      if (v.recovered !== undefined) return `Contestazione persa: ${euro(v.recovered) ?? "importo"} recuperato dal professionista`;
      return "Contestazione della carta: importo recuperato";
    case "professionalDebtEurCents":
      if (v.recovered !== undefined) return `Debito del professionista recuperato: ${euro(v.recovered) ?? "—"}`;
      return `Debito del professionista: +${euro(v.added) ?? "—"}${euro(v.total) ? ` (totale ${euro(v.total)})` : ""}`;
    case "refundedEurCents":
      return `Rimborso al cliente: totale rimborsato ${euro(value) ?? asText(value)}`;
    default:
      return "Pagamento aggiornato";
  }
}

function fiscalLabel(fieldName: string, value: unknown): string {
  const v = asRecord(value);
  if (fieldName === "fiscalDeclarationAccepted") return "Dichiarazione dei dati fiscali accettata";
  if (fieldName === "verificationStatus") return `Dati fiscali ${FISCAL_STATUS_LABEL[asText(value)] ?? asText(value)}`;
  if (fieldName === "stripeConnectAccountId") return "Conto Stripe collegato";
  if (fieldName === "stripeManualPayoutsAt") return "Conto Stripe: bonifici manuali attivati";
  if (fieldName === "payoutIban") return `Conto per i bonifici: ${asText(v.iban)}`;
  if (fieldName.startsWith("taxIdCheck.")) {
    const what = fieldName.endsWith("partitaIva") ? "partita IVA" : "codice fiscale";
    return `Controllo ${what}: ${TAX_ID_OUTCOME_LABEL[asText(value)] ?? asText(value)}`;
  }
  const label = FISCAL_FIELD_LABEL[fieldName] ?? fieldName;
  const shown = fieldName === "dateOfBirth" ? date(value) : fieldName === "entityType" ? (ENTITY_KIND_LABEL[asText(value)] ?? asText(value)) : asText(value);
  return `Dati fiscali: ${label} "${shown}"`;
}

export function auditLabel(row: { entityType: string; fieldName: string | null; newValue: string | null }): string {
  const { entityType, fieldName } = row;
  const raw = row.newValue;
  const value = parse(raw);
  const v = asRecord(value);

  if (fieldName === "suspendedAt") return value === "SUSPENDED" ? "Account sospeso" : "Account riattivato";
  if (fieldName === "adminRole" || fieldName === "adminRoles") {
    const labels = (raw ?? "").replace(/"/g, "").replace(/[[\]]/g, "").split(/[+,]/).filter(Boolean).map((r) => ROLE_SHORT_LABEL[r] ?? r);
    return `Ruolo cambiato in ${labels.join(" + ") || "—"}`;
  }
  if (fieldName === "adminTwoFactor") {
    if (value === "RESET") return "Verifica in due passaggi azzerata";
    if (value === "RESET_BY_EMAIL") return "Verifica in due passaggi azzerata con il codice via email";
    return "Verifica in due passaggi attivata";
  }
  if (fieldName === "profileInvite") {
    return v.businessName ? `Profilo creato per ${asText(v.businessName)}${v.city ? ` a ${asText(v.city)}` : ""}` : "Profilo creato da un operatore confermato";
  }

  switch (entityType) {
    case "ContentReport":
      if (fieldName === "revert") return "Misura annullata";
      if (fieldName === "appeal") return "Contestazione respinta";
      if (fieldName === "status" && typeof value === "string" && value.startsWith("RESOLVED")) {
        const action = value.split(":")[1] ?? "";
        return `Segnalazione accolta: ${ACTION_SHORT_LABEL[action] ?? (action || "nessuna misura")}`;
      }
      if (fieldName === "status" && value === "DISMISSED") return "Segnalazione non accolta";
      return "Segnalazione aggiornata";
    case "JobPayment":
      return jobPaymentLabel(fieldName, value);
    case "ProfessionalFiscalProfile":
      return fieldName ? fiscalLabel(fieldName, value) : "Dati fiscali aggiornati";
    case "FiscalRepresentative":
      return `Legale rappresentante: ${[v.firstName, v.lastName].filter((x) => typeof x === "string").join(" ") || "aggiornato"}`;
    case "ProfessionalProfile":
      if (fieldName === "verified") return value === true ? "Badge \"Verificato\" dato" : "Badge \"Verificato\" tolto";
      if (fieldName === "jobIssueSanction") {
        const sanction = asText(v.sanction);
        return `Misura per i problemi segnalati: ${SANCTION_LABEL[sanction] ?? sanction}${v.until ? ` fino al ${date(v.until)}` : ""}`;
      }
      return "Profilo aggiornato";
    case "IdentityVerification":
      if (fieldName === "biometricConsent") return "Consenso alla verifica con documento e selfie";
      if (fieldName === "status") return `Verifica dell'identità ${IDENTITY_STATUS_LABEL[asText(value)] ?? asText(value)}`;
      return "Verifica dell'identità aggiornata";
    case "JobIssue":
      if (fieldName === "infoRequest") return "Chieste più informazioni sul problema";
      if (fieldName === "appeal") return "Il professionista contesta la decisione";
      if (fieldName === "appealDecision") return `Contestazione ${JOB_ISSUE_DECISION_LABEL[asText(value)] ?? asText(value)}`;
      if (fieldName === "status") {
        const decision = asText(v.decision);
        return `Problema sul lavoro: segnalazione ${JOB_ISSUE_DECISION_LABEL[decision] ?? decision}${typeof v.refundPercent === "number" && v.refundPercent > 0 ? `, rimborso del ${v.refundPercent}%` : ""}`;
      }
      return "Problema sul lavoro aggiornato";
    case "Refund":
      return `Rimborso al cliente${euro(v.amountEurCents) ? ` di ${euro(v.amountEurCents)}` : ""}${typeof v.refundPercent === "number" ? ` (${v.refundPercent}%)` : ""}`;
    case "Dispute":
      return "Pagamento contestato dal cliente";
    case "Conversation":
      return "Conversazione letta da un admin";
    case "GeneralRequestSettings":
      return "Soglie delle richieste generali cambiate";
    case "GeneralRequestBlock":
      return value === "OPEN" ? "Richieste generali riaperte" : "Richieste generali chiuse";
    default:
      if (fieldName === "status" && typeof value === "string") return `Stato cambiato in ${value}`;
      return "Modifica registrata";
  }
}
