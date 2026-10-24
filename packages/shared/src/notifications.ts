import { z } from "zod";
import "./zod";

/**
 * Preferenze di notifica per argomento e canale (docs/CHANGELOG.md §152,
 * richiesta esplicita dell'utente). Un argomento raggruppa più tipi di
 * notifica: scegliere per ognuno dei ~25 tipi sarebbe ingestibile. Per
 * ogni argomento tre canali: sito (campanella e popup), email, SMS.
 * "Account e sicurezza" è bloccato acceso: le decisioni di moderazione vanno
 * comunicate per legge (DSA art. 17), non si possono spegnere.
 */
export const NOTIFICATION_TOPICS = ["richieste", "preventivi", "lavori", "messaggi", "promemoria", "account"] as const;
export type NotificationTopic = (typeof NOTIFICATION_TOPICS)[number];

export const NOTIFICATION_CHANNELS = ["inApp", "email", "sms"] as const;
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
    client: { label: "Lavori e appuntamenti", description: "Promemoria il giorno prima, professionista in arrivo, lavoro terminato, saldo da pagare, intervento annullato." },
    types: [
      "JOB_COMPLETED",
      "BOOKING_CANCELED_BY_PROFESSIONAL",
      // Il cliente annulla: prima il professionista non riceveva nulla (docs/CHANGELOG.md §235).
      "BOOKING_CANCELED_BY_CLIENT",
      "BOOKING_REOPENED_BY_CLIENT",
      "BOOKING_REOPENED_BY_PROFESSIONAL",
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
      // Cifra da restituire dopo un rimborso o una contestazione persa, ripresa dai pagamenti successivi (docs/CHANGELOG.md §267).
      "JOB_PAYMENT_DEBT",
      // Rimborso in attesa di fondi sul conto Stripe del professionista, poi arrivato o non riuscito (docs/CHANGELOG.md §269).
      "JOB_REFUND_PENDING",
      "JOB_REFUND_COMPLETED",
      "JOB_REFUND_WAITING_FUNDS",
      "ADMIN_JOB_REFUND_FAILED",
      // Anno DAC7 già comunicato con importi cambiati dopo l'invio (docs/CHANGELOG.md §247).
      "ADMIN_DAC7_NEEDS_CORRECTION",
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
    ],
    activeChannels: ["inApp", "email"],
  },
  messaggi: {
    professional: { label: "Messaggi", description: "Quando un cliente ti scrive in chat." },
    client: { label: "Messaggi", description: "Quando un professionista ti scrive in chat." },
    types: ["TIMELINE_MESSAGE_FROM_CLIENT", "TIMELINE_MESSAGE_FROM_PROFESSIONAL"],
    // Email solo se il messaggio resta non letto sul sito per qualche minuto (docs/CHANGELOG.md §328).
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

const channelPrefsSchema = z.object({ inApp: z.boolean(), email: z.boolean(), sms: z.boolean() });

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

/** Tutto acceso tranne gli SMS (servono il consenso esplicito e hanno un costo). */
export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  topics: {
    richieste: { inApp: true, email: true, sms: false },
    preventivi: { inApp: true, email: true, sms: false },
    lavori: { inApp: true, email: true, sms: false },
    messaggi: { inApp: true, email: true, sms: false },
    promemoria: { inApp: true, email: true, sms: false },
    account: { inApp: true, email: true, sms: false },
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
  if (NOTIFICATION_TOPIC_INFO[topic].locked && channel !== "sms") return true;
  return prefs.topics[topic][channel];
}
