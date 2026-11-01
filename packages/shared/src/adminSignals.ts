/**
 * Segnali da controllare sulla scheda della persona in Admin
 * (docs/changelog/2026-10-30-admin-persone.md): fatti che da soli non
 * provano niente, ma insieme fanno pensare a recensioni finte o a più account
 * della stessa persona. Li guarda un admin, il sito non decide mai da solo.
 */
export type AdminUserSignalKind =
  | "SAME_PHONE"
  | "SAME_ADDRESS"
  | "SAME_TAX_ID"
  | "REVIEW_SAME_PERSON"
  | "QUICK_REVIEW"
  | "CLOSED_BEFORE_APPOINTMENT"
  | "FULL_DEPOSIT_NEW_PRO";

export const ADMIN_USER_SIGNAL_LABEL: Record<AdminUserSignalKind, string> = {
  SAME_PHONE: "Stesso telefono di un altro account",
  SAME_ADDRESS: "Stesso indirizzo di un altro account",
  SAME_TAX_ID: "Stesso codice fiscale o partita IVA di un altro account",
  REVIEW_SAME_PERSON: "Recensione tra due account con lo stesso telefono, indirizzo o codice fiscale",
  QUICK_REVIEW: "Recensione scritta poco dopo l'iscrizione",
  CLOSED_BEFORE_APPOINTMENT: "Lavoro chiuso prima dell'appuntamento",
  FULL_DEPOSIT_NEW_PRO: "Acconto del 100% chiesto da un professionista nuovo",
};

/** Una recensione entro questo tempo dall'iscrizione di chi la scrive è un segnale. */
export const QUICK_REVIEW_HOURS = 48;
/** Un professionista è "nuovo" per i primi giorni dall'iscrizione. */
export const NEW_PROFESSIONAL_DAYS = 30;

export type AdminSignalRole = "CLIENT" | "PROFESSIONAL" | "ADMIN";

export type AdminUserSignal = {
  kind: AdminUserSignalKind;
  /** Il dettaglio in una riga, es. "anche Mario Rossi". */
  detail: string;
  /** Gli altri account coinvolti, per aprirli. */
  others: { id: string; label: string; role?: AdminSignalRole }[];
};

/**
 * Cosa conviene fare, deciso dai segnali (proposta accolta da Luca il
 * 30/10/2026: "in cima alla lista le azioni suggerite, così non devo aprire
 * tutte le schede"). Resta un consiglio: decide sempre un admin.
 */
export type AdminSignalAdviceLevel = "ALTA" | "MEDIA" | "BASSA";
export type AdminSignalAdvice = {
  level: AdminSignalAdviceLevel;
  text: string;
  /** Scheda della persona dove si fa ("?scheda=..."). */
  tab: "riepilogo" | "recensioni" | "lavori";
};

export const ADMIN_SIGNAL_ADVICE_LEVEL_LABEL: Record<AdminSignalAdviceLevel, string> = {
  ALTA: "Da fare subito",
  MEDIA: "Da guardare",
  BASSA: "Nessuna azione",
};

export type AdminSuspiciousUser = {
  id: string;
  label: string;
  role: AdminSignalRole;
  signals: AdminUserSignal[];
  advice: AdminSignalAdvice;
  /** Prima volta che il controllo l'ha trovato. */
  firstSeenAt: string;
};

export type AdminSuspiciousUsers = {
  /** Ultimo controllo (ogni mattina alle 7 o con "Controlla ora"); `null` se mai fatto. */
  checkedAt: string | null;
  users: AdminSuspiciousUser[];
};

const SHARED_KINDS: AdminUserSignalKind[] = ["SAME_PHONE", "SAME_ADDRESS", "SAME_TAX_ID"];
const LEVEL_ORDER: Record<AdminSignalAdviceLevel, number> = { ALTA: 0, MEDIA: 1, BASSA: 2 };

const names = (others: AdminUserSignal["others"]) => others.map((o) => o.label).join(", ");

/** Il consiglio più importante tra quelli dei segnali di una persona. */
export function adviseSuspiciousUser(role: AdminSignalRole, signals: AdminUserSignal[]): AdminSignalAdvice {
  const options: AdminSignalAdvice[] = [];
  for (const signal of signals) {
    const others = signal.others;
    const pros = others.filter((o) => o.role === "PROFESSIONAL");
    switch (signal.kind) {
      case "REVIEW_SAME_PERSON":
        options.push(
          role === "PROFESSIONAL"
            ? {
                level: "ALTA",
                text: `Controlla le recensioni che gli ha scritto ${names(others)}: hanno gli stessi dati. Se sono finte, nascondile e valuta di togliere il profilo dalla ricerca.`,
                tab: "recensioni",
              }
            : { level: "ALTA", text: `Nascondi la sua recensione a ${names(others)}: hanno gli stessi dati, è probabilmente finta.`, tab: "recensioni" },
        );
        break;
      case "SAME_TAX_ID":
        options.push(
          role === "PROFESSIONAL" && pros.length > 0
            ? { level: "ALTA", text: `Due profili con lo stesso codice fiscale o partita IVA (anche ${names(pros)}): tieni quello vero e togli l'altro dalla ricerca.`, tab: "riepilogo" }
            : { level: "MEDIA", text: `Stesso codice fiscale o partita IVA di ${names(others)}: controlla che siano davvero persone diverse.`, tab: "riepilogo" },
        );
        break;
      case "SAME_PHONE":
      case "SAME_ADDRESS": {
        const what = signal.kind === "SAME_PHONE" ? "telefono" : "indirizzo";
        if (role === "PROFESSIONAL" && pros.length > 0) {
          options.push({ level: "MEDIA", text: `Forse è lo stesso professionista con due profili (stesso ${what} di ${names(pros)}): confronta i profili.`, tab: "riepilogo" });
        } else if (pros.length > 0 || role === "PROFESSIONAL") {
          options.push({ level: "BASSA", text: `Cliente e professionista con lo stesso ${what}: nessuna azione finché non ci sono recensioni tra loro.`, tab: "riepilogo" });
        } else {
          options.push({ level: "BASSA", text: `Stesso ${what} di ${names(others)}: probabilmente la stessa famiglia o casa, nessuna azione.`, tab: "riepilogo" });
        }
        break;
      }
      case "CLOSED_BEFORE_APPOINTMENT":
        options.push({ level: "MEDIA", text: "Ha chiuso un lavoro prima dell'appuntamento: guarda se il cliente l'ha confermato, altrimenti chiedigli com'è andata.", tab: "lavori" });
        break;
      case "FULL_DEPOSIT_NEW_PRO":
        options.push({ level: "MEDIA", text: "Professionista nuovo che chiede tutto in acconto: guarda il lavoro, se non parte il cliente rischia i soldi.", tab: "lavori" });
        break;
      case "QUICK_REVIEW":
        options.push({ level: "BASSA", text: "Recensione scritta subito dopo l'iscrizione: da sola non vuol dire niente, nessuna azione.", tab: "recensioni" });
        break;
    }
  }
  options.sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level]);
  return options[0] ?? { level: "BASSA", text: "Nessuna azione.", tab: "riepilogo" };
}

/** Prima chi ha un consiglio più urgente, poi chi ha più segnali. */
export function sortSuspiciousUsers<T extends { label: string; signals: unknown[]; advice: AdminSignalAdvice }>(users: T[]): T[] {
  return [...users].sort(
    (a, b) => LEVEL_ORDER[a.advice.level] - LEVEL_ORDER[b.advice.level] || b.signals.length - a.signals.length || a.label.localeCompare(b.label, "it"),
  );
}

export function isSharedSignal(kind: AdminUserSignalKind): boolean {
  return SHARED_KINDS.includes(kind);
}

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
