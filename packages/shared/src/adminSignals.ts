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
  | "FULL_DEPOSIT_NEW_PRO"
  // Controlli in più chiesti da Luca il 02/11/2026 ("quelli che farebbe un professionista di alto rango").
  | "SAME_IBAN"
  | "CONTACTS_IN_CHAT"
  | "RETURNED_AFTER_SUSPENSION"
  | "RETURNED_AFTER_CLOSE"
  | "DISPOSABLE_EMAIL"
  | "REVIEW_BURST"
  | "MANY_UPHELD_ISSUES"
  | "MANY_REJECTED_ISSUES";

export const ADMIN_USER_SIGNAL_LABEL: Record<AdminUserSignalKind, string> = {
  SAME_PHONE: "Stesso telefono di un altro account",
  SAME_ADDRESS: "Stesso indirizzo di un altro account",
  SAME_TAX_ID: "Stesso codice fiscale o partita IVA di un altro account",
  REVIEW_SAME_PERSON: "Recensione tra due account con lo stesso telefono, indirizzo o codice fiscale",
  QUICK_REVIEW: "Recensione scritta poco dopo l'iscrizione",
  CLOSED_BEFORE_APPOINTMENT: "Lavoro chiuso prima dell'appuntamento",
  FULL_DEPOSIT_NEW_PRO: "Acconto del 100% chiesto da un professionista nuovo",
  SAME_IBAN: "Stesso IBAN di un altro professionista",
  CONTACTS_IN_CHAT: "Telefono, email o link scritti in chat prima dell'accettazione",
  RETURNED_AFTER_SUSPENSION: "Iscritto con l'email di un account sospeso e chiuso",
  RETURNED_AFTER_CLOSE: "Iscritto con l'email di un account chiuso",
  DISPOSABLE_EMAIL: "Email usa e getta",
  REVIEW_BURST: "Molte recensioni in pochi giorni da clienti appena iscritti",
  MANY_UPHELD_ISSUES: "Più problemi sul lavoro accolti contro di lui",
  MANY_REJECTED_ISSUES: "Più problemi sul lavoro segnalati e respinti",
};

/** Una recensione entro questo tempo dall'iscrizione di chi la scrive è un segnale. */
export const QUICK_REVIEW_HOURS = 48;
/** Un professionista è "nuovo" per i primi giorni dall'iscrizione. */
export const NEW_PROFESSIONAL_DAYS = 30;
/** Ondata di recensioni: almeno 3 in 7 giorni da clienti iscritti da meno di 30 giorni. */
export const REVIEW_BURST_COUNT = 3;
export const REVIEW_BURST_DAYS = 7;
export const NEW_CLIENT_DAYS = 30;
/** Problemi sul lavoro: almeno 2 accolti (professionista) o respinti (cliente) negli ultimi 6 mesi. */
export const MANY_ISSUES_COUNT = 2;
export const MANY_ISSUES_DAYS = 180;

/**
 * Domini di email usa e getta più diffusi (si cancellano da sole dopo poco):
 * per un professionista vuol dire fatture e avvisi che non arrivano a nessuno.
 */
export const DISPOSABLE_EMAIL_DOMAINS: readonly string[] = [
  "mailinator.com",
  "yopmail.com",
  "yopmail.fr",
  "guerrillamail.com",
  "guerrillamail.info",
  "sharklasers.com",
  "grr.la",
  "10minutemail.com",
  "10minutemail.net",
  "temp-mail.org",
  "tempmail.com",
  "tempmail.net",
  "temp-mail.io",
  "tempail.com",
  "trashmail.com",
  "trashmail.de",
  "getnada.com",
  "nada.email",
  "dispostable.com",
  "maildrop.cc",
  "mailnesia.com",
  "mintemail.com",
  "throwawaymail.com",
  "fakeinbox.com",
  "emailondeck.com",
  "mohmal.com",
  "spambox.us",
  "mytemp.email",
  "tempr.email",
  "discard.email",
  "moakt.com",
  "burnermail.io",
  "inboxkitten.com",
  "mail.tm",
  "1secmail.com",
];

export function isDisposableEmail(email: string | null | undefined): boolean {
  const domain = (email ?? "").trim().toLowerCase().split("@")[1];
  return Boolean(domain) && DISPOSABLE_EMAIL_DOMAINS.some((d) => domain === d || domain!.endsWith(`.${d}`));
}

/**
 * Telefono, email o link in un messaggio, o l'invito a scriversi su WhatsApp.
 * Un numero conta da 9 cifre in su, separate al massimo da uno spazio o un
 * trattino: date ("12.11.2026 10.30") e prezzi non contano. Solo per contare i messaggi: il testo non si salva nei segnali.
 */
export function messageHasContacts(text: string): boolean {
  // Parola per parola e cifra per cifra, senza espressioni regolari che su un testo lungo diventano lente.
  const lower = text.toLowerCase();
  if (lower.includes("whatsapp") || lower.includes("whats app")) return true;
  for (const word of lower.split(/\s+/)) {
    if (word.startsWith("http://") || word.startsWith("https://") || word.startsWith("www.")) return true;
    const at = word.indexOf("@");
    if (at > 0 && word.indexOf(".", at + 2) > at + 1) return true;
  }
  let digits = 0;
  let separators = 0;
  for (const char of text) {
    if (char >= "0" && char <= "9") {
      digits += 1;
      separators = 0;
      if (digits >= 9) return true;
    } else if ((char === " " || char === "-" || (char === "+" && digits === 0)) && separators === 0) {
      separators += char === "+" ? 0 : 1;
    } else {
      digits = 0;
      separators = 0;
    }
  }
  return false;
}

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
  /** "Va bene così" di un admin; torna \`null\` quando il controllo trova un segnale nuovo. */
  dismissed: AdminSignalDismissal | null;
};

export type AdminSignalDismissal = { at: string; by: string; note: string };

/** Chiave di un segnale per "Va bene così": se cambia il dettaglio (es. un messaggio in più) è un segnale nuovo. */
export function signalKey(signal: Pick<AdminUserSignal, "kind" | "detail">): string {
  return `${signal.kind}|${signal.detail}`;
}

/** Vero se tra i segnali di oggi ce n'è almeno uno che non c'era al "Va bene così". */
export function hasNewSignals(signals: AdminUserSignal[], dismissedKeys: string[]): boolean {
  const known = new Set(dismissedKeys);
  return signals.some((s) => !known.has(signalKey(s)));
}

export type AdminSuspiciousUsers = {
  /** Ultimo controllo (ogni mattina alle 7 o con "Controlla ora"); `null` se mai fatto. */
  checkedAt: string | null;
  users: AdminSuspiciousUser[];
};

const SHARED_KINDS: AdminUserSignalKind[] = ["SAME_PHONE", "SAME_ADDRESS", "SAME_TAX_ID", "SAME_IBAN"];
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
      case "SAME_IBAN":
        options.push(
          pros.length > 0
            ? { level: "ALTA", text: `Due profili con lo stesso IBAN (anche ${names(pros)}): i soldi vanno alla stessa persona. Tieni quello vero e togli l'altro dalla ricerca.`, tab: "riepilogo" }
            : { level: "MEDIA", text: `Stesso IBAN di ${names(others)}: controlla che siano davvero persone diverse.`, tab: "riepilogo" },
        );
        break;
      case "CONTACTS_IN_CHAT":
        options.push(
          role === "PROFESSIONAL"
            ? {
                level: "MEDIA",
                text: "Ha scritto telefono, email o link in chat prima che il cliente accettasse: ricordagli che i contatti si scambiano dopo l'accettazione; se continua, avvertilo.",
                tab: "riepilogo",
              }
            : { level: "BASSA", text: "Il cliente ha scritto i suoi contatti in chat prima di accettare: è una sua scelta, nessuna azione.", tab: "riepilogo" },
        );
        break;
      case "RETURNED_AFTER_SUSPENSION":
        options.push({ level: "ALTA", text: "Si è iscritto di nuovo con l'email di un account sospeso: valuta di sospendere anche questo.", tab: "riepilogo" });
        break;
      case "RETURNED_AFTER_CLOSE":
        options.push({ level: "BASSA", text: "Ha chiuso un account e se ne è fatto un altro con la stessa email: succede, nessuna azione.", tab: "riepilogo" });
        break;
      case "DISPOSABLE_EMAIL":
        options.push(
          role === "PROFESSIONAL"
            ? { level: "MEDIA", text: "Professionista con un'email usa e getta: chiedigli un'email vera, servono per fatture e avvisi dei clienti.", tab: "riepilogo" }
            : { level: "BASSA", text: "Cliente con un'email usa e getta: nessuna azione, ma i nostri avvisi non gli arriveranno a lungo.", tab: "riepilogo" },
        );
        break;
      case "REVIEW_BURST":
        options.push({ level: "MEDIA", text: `${signal.detail.charAt(0).toUpperCase()}${signal.detail.slice(1)}: leggile, se si somigliano possono essere finte.`, tab: "recensioni" });
        break;
      case "MANY_UPHELD_ISSUES":
        options.push({ level: "MEDIA", text: `${signal.detail.charAt(0).toUpperCase()}${signal.detail.slice(1)}: valuta un avvertimento o di togliere il profilo dalla ricerca.`, tab: "lavori" });
        break;
      case "MANY_REJECTED_ISSUES":
        options.push({ level: "MEDIA", text: `${signal.detail.charAt(0).toUpperCase()}${signal.detail.slice(1)}: guarda se chiede rimborsi che non gli spettano.`, tab: "lavori" });
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
