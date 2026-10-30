/**
 * Segnali da controllare sulla scheda della persona in Admin
 * (docs/changelog/2026-10-30-admin-persone.md): fatti che da soli non
 * provano niente, ma insieme fanno pensare a recensioni finte o a più account
 * della stessa persona. Li guarda un admin, il sito non decide mai da solo.
 */
export type AdminUserSignalKind = "SAME_PHONE" | "SAME_ADDRESS" | "SAME_TAX_ID" | "QUICK_REVIEW" | "CLOSED_BEFORE_APPOINTMENT" | "FULL_DEPOSIT_NEW_PRO";

export const ADMIN_USER_SIGNAL_LABEL: Record<AdminUserSignalKind, string> = {
  SAME_PHONE: "Stesso telefono di un altro account",
  SAME_ADDRESS: "Stesso indirizzo di un altro account",
  SAME_TAX_ID: "Stesso codice fiscale o partita IVA di un altro account",
  QUICK_REVIEW: "Recensione scritta poco dopo l'iscrizione",
  CLOSED_BEFORE_APPOINTMENT: "Lavoro chiuso prima dell'appuntamento",
  FULL_DEPOSIT_NEW_PRO: "Acconto del 100% chiesto da un professionista nuovo",
};

/** Una recensione entro questo tempo dall'iscrizione di chi la scrive è un segnale. */
export const QUICK_REVIEW_HOURS = 48;
/** Un professionista è "nuovo" per i primi giorni dall'iscrizione. */
export const NEW_PROFESSIONAL_DAYS = 30;

export type AdminUserSignal = {
  kind: AdminUserSignalKind;
  /** Il dettaglio in una riga, es. "anche Mario Rossi". */
  detail: string;
  /** Gli altri account coinvolti, per aprirli. */
  others: { id: string; label: string }[];
};

export type AdminSuspiciousUser = {
  id: string;
  label: string;
  role: "CLIENT" | "PROFESSIONAL" | "ADMIN";
  signals: AdminUserSignal[];
};

/** Stati in italiano nella scheda della persona (prima "CONFIRMED", "COMPLETED"…). */
export const ADMIN_BOOKING_STATUS_LABEL: Record<"PENDING" | "CONFIRMED" | "COMPLETED" | "CANCELED" | "NO_SHOW", string> = {
  PENDING: "Da confermare",
  CONFIRMED: "Confermato",
  COMPLETED: "Terminato",
  CANCELED: "Annullato",
  NO_SHOW: "Non si è presentato",
};

export const ADMIN_REQUEST_STATUS_LABEL: Record<"OPEN" | "MATCHED" | "CLOSED", string> = {
  OPEN: "Aperta",
  MATCHED: "Con un lavoro",
  CLOSED: "Chiusa",
};
