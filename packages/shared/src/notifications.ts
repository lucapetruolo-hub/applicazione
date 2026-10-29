import { z } from "zod";
import "./zod";

/**
 * Preferenze di notifica per argomento e canale (docs/CHANGELOG.md §152,
 * richiesta esplicita dell'utente). Un argomento raggruppa più tipi di
 * notifica: scegliere per ognuno dei ~25 tipi sarebbe ingestibile. Per
 * ogni argomento due canali: sito (campanella e popup) ed email. WhatsApp
 * non è un canale per argomento: pochi promemoria scelti, con il numero
 * confermato e un interruttore solo (`whatsapp.ts`,
 * docs/changelog/2026-10-28-promemoria-whatsapp.md; prima qui c'era una
 * colonna SMS che non mandava nulla).
 * "Account e sicurezza" è bloccato acceso: le decisioni di moderazione vanno
 * comunicate per legge (DSA art. 17), non si possono spegnere.
 */
export const NOTIFICATION_TOPICS = ["richieste", "preventivi", "lavori", "messaggi", "promemoria", "account"] as const;
export type NotificationTopic = (typeof NOTIFICATION_TOPICS)[number];

export const NOTIFICATION_CHANNELS = ["inApp", "email"] as const;
export type NotificationChannelKey = (typeof NOTIFICATION_CHANNELS)[number];

export type NotificationTopicInfo = {
  /** Etichetta e spiegazione per il professionista e per il cliente. */
  professional: { label: string; description: string };
  client: { label: string; description: string };
  /** Tipi di notifica (`Notification.type`) che appartengono all'argomento. */
  types: string[];
  /** Non disattivabile (obblighi di legge). */
  locked?: boolean;
  /** Canali per cui oggi parte davvero un invio: gli altri sono salvati per quando arriveranno. */
  activeChannels: NotificationChannelKey[];
};

export const NOTIFICATION_TOPIC_INFO: Record<NotificationTopic, NotificationTopicInfo> = {
  richieste: {
    professional: { label: "Nuove richieste", description: "Quando un cliente ti chiede un preventivo." },
    client: { label: "Le tue richieste", description: "Conferma dell'invio, un professionista trovato più tardi, e se un professionista rifiuta, la richiesta scade o viene inoltrata ad altri." },
    // REQUEST_SENT: solo email, la conferma al cliente che la richiesta è partita (docs/CHANGELOG.md §185).
    // REQUEST_MATCHED_LATER: richiesta senza destinatari arrivata al primo professionista iscritto dopo (§271).
    types: ["NEW_LEAD", "LEAD_DECLINED", "GUIDED_REQUEST_EXPIRED", "REQUEST_FORWARDED", "REQUEST_FORWARD_NO_MATCH", "REQUEST_MATCHED_LATER", "REQUEST_SENT"],
    activeChannels: ["inApp", "email"],
  },
  preventivi: {
    professional: { label: "Preventivi e date", description: "Preventivo accettato o rifiutato, data proposta dal cliente." },
    client: { label: "Preventivi e date", description: "Nuovo preventivo o aggiornato, data confermata o cambiata, preventivo ritirato." },
    types: [
      "NEW_QUOTE",
      "QUOTE_ACCEPTED",
      "QUOTE_REJECTED",
      "QUOTE_WITHDRAWN",
      "QUOTE_DATE_PROPOSED",
      "QUOTE_DATE_CHANGED",
      // Preventivo aggiornato senza cambio di data (docs/CHANGELOG.md §196).
      "QUOTE_UPDATED",
      "QUOTE_DATE_CONFIRMED",
      "QUOTE_DATE_REJECTED",
      // Acconto pagato ma lavoro non più confermabile: rimborsato (docs/CHANGELOG.md §240).
      "QUOTE_DEPOSIT_REFUNDED",
    ],
    activeChannels: ["inApp", "email"],
  },
  lavori: {
    professional: { label: "Lavori e appuntamenti", description: "Promemoria il giorno prima, riepilogo della sera, nuove recensioni, pagamenti, prenotazioni annullate o riaperte, segnalazioni." },
    client: { label: "Lavori e appuntamenti", description: "Promemoria il giorno prima, professionista in arrivo, lavoro terminato, saldo da pagare, copia della ricevuta, intervento annullato." },
    types: [
      // Solo email al cliente: appuntamento prenotato, con il calendario (docs/CHANGELOG.md §346).
      "BOOKING_CONFIRMED",
      "JOB_COMPLETED",
      "BOOKING_CANCELED_BY_PROFESSIONAL",
      // Il cliente annulla: prima il professionista non riceveva nulla (docs/CHANGELOG.md §235).
      "BOOKING_CANCELED_BY_CLIENT",
      "BOOKING_REOPENED_BY_CLIENT",
      "BOOKING_REOPENED_BY_PROFESSIONAL",
      // Risposta del cliente al promemoria WhatsApp: "Ci sarò" o "Non posso più".
      "BOOKING_CLIENT_CONFIRMED",
      "BOOKING_CLIENT_CANT_COME",
      "BOOKING_NO_SHOW_REPORTED",
      // Segnalazioni di un problema sul lavoro (docs/CHANGELOG.md §164).
      "JOB_ISSUE_REPORTED",
      "JOB_ISSUE_RESOLVED",
      "JOB_ISSUE_SETTLED",
      "JOB_ISSUE_ESCALATED",
      // Controversie standard (docs/CHANGELOG.md §167).
      "JOB_ISSUE_AUTO_ESCALATED",
      "JOB_ISSUE_TEAM_REVIEW",
      "JOB_ISSUE_INFO_REQUESTED",
      "JOB_ISSUE_APPEAL_DECIDED",
      "JOB_ISSUE_UNRESOLVED",
      // Pagamenti online dei lavori (docs/CHANGELOG.md §168).
      "JOB_DEPOSIT_PAID",
      "JOB_BALANCE_PAID",
      "JOB_BALANCE_DUE",
      // Saldo addebitato da solo sulla carta salvata con l'acconto (docs/CHANGELOG.md §267).
      "JOB_BALANCE_AUTO_CHARGED",
      "JOB_BALANCE_UNPAID",
      "JOB_PAYOUT_SENT",
      "JOB_PAYOUT_ACCOUNT_NEEDED",
      // Bonifico dal conto Stripe del professionista non riuscito (docs/CHANGELOG.md §249).
      "JOB_PAYOUT_FAILED",
      "ADMIN_JOB_BALANCE_UNPAID",
      // Contestazione del cliente presso la sua banca (docs/CHANGELOG.md §236).
      "JOB_STRIPE_DISPUTE",
      "ADMIN_STRIPE_DISPUTE",
      // Prove della contestazione non ancora mandate a 3 giorni dalla scadenza (docs/changelog/2026-10-28-stripe-prova.md).
      "ADMIN_STRIPE_DISPUTE_DUE",
      // Al professionista che non ha ancora scritto la sua spiegazione, 5 giorni prima della scadenza.
      "JOB_STRIPE_DISPUTE_NOTE_DUE",
      // Cifra da restituire dopo un rimborso o una contestazione persa, ripresa dai pagamenti successivi (docs/CHANGELOG.md §267).
      "JOB_PAYMENT_DEBT",
      // Rimborso in attesa di fondi sul conto Stripe del professionista, poi arrivato o non riuscito (docs/CHANGELOG.md §269).
      "JOB_REFUND_PENDING",
      "JOB_REFUND_COMPLETED",
      "JOB_REFUND_WAITING_FUNDS",
      "ADMIN_JOB_REFUND_FAILED",
      // Stato del conto Stripe di un professionista non riletto (docs/changelog/2026-10-28-stripe-prova.md).
      "ADMIN_STRIPE_ACCOUNT_UNREADABLE",
      // Tetto ai pagamenti online tolto (docs/changelog/2026-10-28-tetto-pagamenti-online.md).
      "ONLINE_LIMIT_LIFTED",
      // Anno DAC7 già comunicato con importi cambiati dopo l'invio (docs/CHANGELOG.md §247).
      "ADMIN_DAC7_NEEDS_CORRECTION",
      // Urgenti oltre il 30% o non più veloci delle normali, ogni lunedì (docs/CHANGELOG.md §338).
      "ADMIN_URGENCY_ALERT",
      // Lavori e città con molte ricerche senza nessun professionista vicino, ogni lunedì (docs/CHANGELOG.md §371).
      "ADMIN_SEARCH_DEMAND_ALERT",
      // Cosa fare questa settimana, consigli dai numeri del sito, ogni lunedì (docs/CHANGELOG.md §372).
      "ADMIN_WEEKLY_ADVICE",
      // Solo una parte ha chiuso il lavoro (docs/CHANGELOG.md §190).
      "JOB_CONFIRM_REMINDER",
      "JOB_AUTO_CONFIRMED",
      "JOB_CLOSE_REMINDER",
      "JOB_CLOSE_EXPIRED",
      "ADMIN_JOB_NOT_CLOSED",
      // Soldi bloccati da più di 80 giorni, Stripe li paga comunque dopo 90 (docs/CHANGELOG.md §249).
      "ADMIN_JOB_PAYMENT_LONG_HOLD",
      "BOOKING_REMINDER",
      // Agenda vuota o senza disponibilità nei prossimi 7 giorni (docs/CHANGELOG.md §274).
      "AGENDA_REMINDER",
      // Agenda (docs/CHANGELOG.md §288): "Sto arrivando" al cliente, riepilogo della sera prima al professionista.
      "PROFESSIONAL_ON_THE_WAY",
      "AGENDA_TOMORROW_SUMMARY",
      // Nuova recensione ricevuta dal professionista (docs/CHANGELOG.md §185).
      "NEW_REVIEW",
      // Il cliente chiede la fattura dopo l'accettazione, o cambia i dati (docs/CHANGELOG.md §378).
      "JOB_INVOICE_REQUESTED",
      // Al cliente: la copia della ricevuta o della fattura è pronta, o aggiornata (docs/CHANGELOG.md §387).
      "JOB_DOCUMENT_READY",
      // Il 15 dicembre: documenti dati ai clienti da sistemare prima del riepilogo dell'anno (docs/CHANGELOG.md §391).
      "CLIENT_DOCUMENTS_TO_FIX",
      // Trattenute del mese che non tornano con Stripe (docs/CHANGELOG.md §378).
      "ADMIN_FEE_RECONCILIATION",
    ],
    activeChannels: ["inApp", "email"],
  },
  messaggi: {
    professional: { label: "Messaggi", description: "Quando un cliente ti scrive in chat." },
    client: { label: "Messaggi", description: "Quando un professionista ti scrive in chat." },
    types: ["TIMELINE_MESSAGE_FROM_CLIENT", "TIMELINE_MESSAGE_FROM_PROFESSIONAL"],
    // Email solo se il messaggio resta non letto sul sito per qualche minuto (docs/CHANGELOG.md §332).
    activeChannels: ["inApp", "email"],
  },
  promemoria: {
    professional: { label: "Promemoria che imposti tu", description: "Il \"ricordamelo\" scelto dal menu di una richiesta." },
    client: { label: "Promemoria che imposti tu", description: "Il \"ricordamelo\" scelto dal menu di una richiesta." },
    types: ["REQUEST_REMINDER"],
    activeChannels: ["inApp"],
  },
  account: {
    professional: { label: "Account e sicurezza", description: "Decisioni su segnalazioni e sul tuo account, scadenze e limiti dell'abbonamento." },
    client: { label: "Account e sicurezza", description: "Decisioni su segnalazioni e sul tuo account. Obbligatorie per legge." },
    types: [
      "CONTENT_REPORT_RECEIVED",
      "CONTENT_REPORT_DECISION",
      "CONTENT_REPORT_UPHELD",
      "CONTENT_REPORT_REVERTED",
      "CONTENT_REPORT_APPEAL_REJECTED",
      "ACCOUNT_SUSPENDED",
      // Misura per segnalazioni accolte (§167): non si spegne, come la sospensione.
      "JOB_ISSUE_SANCTION",
      "ACCOUNT_REACTIVATED",
      // Badge "Verificato" assegnato o tolto da un admin (docs/CHANGELOG.md §200).
      "PROFILE_VERIFIED",
      "PROFILE_VERIFICATION_REMOVED",
      // Verifica fiscale e d'identità (docs/CHANGELOG.md §253): documento e
      // selfie da rifare, codice fiscale o P.IVA risultati inesistenti.
      "IDENTITY_VERIFICATION_DECLINED",
      "TAX_ID_INVALID",
      // Servizio di verifica tornato disponibile, promemoria a chi non l'ha fatta (§256).
      "IDENTITY_VERIFICATION_READY",
      "IDENTITY_VERIFICATION_REMINDER",
      // Documento della verifica in scadenza (§338).
      "IDENTITY_VERIFICATION_EXPIRING",
      // "Completa il profilo" il giorno dopo l'iscrizione, solo se manca qualcosa (§261).
      "PROFILE_SETUP_REMINDER",
      // Account Stripe attivato: acconto online e badge (docs/CHANGELOG.md §241).
      "STRIPE_ACCOUNT_ACTIVE",
      // Account Stripe sospeso: niente acconto online né badge finché non si sistema (§242).
      "STRIPE_ACCOUNT_RESTRICTED",
      // Avviso annuale DAC7 con i dati comunicati al fisco: obbligo di legge (docs/CHANGELOG.md §246).
      "DAC7_ANNUAL_NOTICE",
      // Promemoria di novembre sui dati DAC7 mancanti e IBAN diverso da Stripe (§247).
      "DAC7_DATA_REMINDER",
      "PAYOUT_IBAN_MISMATCH",
      // Abbonamento (docs/CHANGELOG.md §161): scadenze e limiti mensili.
      "SUBSCRIPTION_BONUS_MONTH",
      "SUBSCRIPTION_TRIAL_ENDING",
      "SUBSCRIPTION_LIMIT_NEAR",
      "SUBSCRIPTION_LIMIT_REACHED",
      "SUBSCRIPTION_PAUSED",
      "SUBSCRIPTION_RENEWING",
      "SUBSCRIPTION_RENEWED",
      "SUBSCRIPTION_ENDING",
      "SUBSCRIPTION_PAYMENT_FAILED",
      // Fattura del mese e estratto pronti in "Fatture e documenti" (docs/CHANGELOG.md §378).
      "MONTHLY_DOCUMENTS_READY",
    ],
    locked: true,
    activeChannels: ["inApp", "email"],
  },
};

export function notificationTopicOf(type: string): NotificationTopic | null {
  for (const topic of NOTIFICATION_TOPICS) {
    if (NOTIFICATION_TOPIC_INFO[topic].types.includes(type)) return topic;
  }
  return null;
}

// Una vecchia chiave "sms" salvata nelle preferenze si ignora (zod la toglie).
const channelPrefsSchema = z.object({ inApp: z.boolean(), email: z.boolean() });

export const notificationPreferencesSchema = z.object({
  topics: z.object({
    richieste: channelPrefsSchema,
    preventivi: channelPrefsSchema,
    lavori: channelPrefsSchema,
    messaggi: channelPrefsSchema,
    promemoria: channelPrefsSchema,
    account: channelPrefsSchema,
  }),
  /** Popup a comparsa sul sito per le notifiche nuove. */
  popups: z.boolean(),
  /** Suono leggero quando arriva una notifica. */
  sound: z.boolean(),
});
export type NotificationPreferences = z.infer<typeof notificationPreferencesSchema>;

/** Tutto acceso. */
export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  topics: {
    richieste: { inApp: true, email: true },
    preventivi: { inApp: true, email: true },
    lavori: { inApp: true, email: true },
    messaggi: { inApp: true, email: true },
    promemoria: { inApp: true, email: true },
    account: { inApp: true, email: true },
  },
  popups: true,
  sound: true,
};

/**
 * Preferenze salvate (anche parziali o di una versione precedente) unite ai
 * valori predefiniti, con "Account e sicurezza" sempre acceso su sito ed
 * email.
 */
export function resolveNotificationPreferences(stored: unknown): NotificationPreferences {
  const base: NotificationPreferences = JSON.parse(JSON.stringify(DEFAULT_NOTIFICATION_PREFERENCES));
  if (stored && typeof stored === "object") {
    const s = stored as Partial<NotificationPreferences>;
    if (typeof s.popups === "boolean") base.popups = s.popups;
    if (typeof s.sound === "boolean") base.sound = s.sound;
    if (s.topics && typeof s.topics === "object") {
      for (const topic of NOTIFICATION_TOPICS) {
        const t = (s.topics as Record<string, unknown>)[topic];
        if (t && typeof t === "object") {
          for (const channel of NOTIFICATION_CHANNELS) {
            const v = (t as Record<string, unknown>)[channel];
            if (typeof v === "boolean") base.topics[topic][channel] = v;
          }
        }
      }
    }
  }
  base.topics.account.inApp = true;
  base.topics.account.email = true;
  return base;
}

/** Il canale è acceso per questo tipo di notifica? Tipi senza argomento: sempre sì. */
export function notificationChannelEnabled(prefs: NotificationPreferences, type: string, channel: NotificationChannelKey): boolean {
  const topic = notificationTopicOf(type);
  if (!topic) return true;
  if (NOTIFICATION_TOPIC_INFO[topic].locked) return true;
  return prefs.topics[topic][channel];
}

/**
 * Lavoro in poche parole per le notifiche ("Nuovo preventivo da Rossi
 * Idraulica · Perdita sotto il lavello", docs/CHANGELOG.md §349): la prima
 * riga della descrizione, al massimo 40 caratteri, con i puntini se tagliata.
 */
export function notificationJobLabel(description: string | null | undefined, maxLength = 40): string | null {
  const firstLine = (description ?? "").split(/\r?\n/)[0]?.trim() ?? "";
  if (!firstLine) return null;
  if (firstLine.length <= maxLength) return firstLine;
  const cut = firstLine.slice(0, maxLength - 1);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > maxLength / 2 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}
