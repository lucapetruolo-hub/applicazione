import { z } from "zod";

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
    client: { label: "Le tue richieste", description: "Se un professionista rifiuta o la richiesta scade." },
    types: ["NEW_LEAD", "LEAD_DECLINED", "GUIDED_REQUEST_EXPIRED"],
    activeChannels: ["inApp", "email"],
  },
  preventivi: {
    professional: { label: "Preventivi e date", description: "Preventivo accettato o rifiutato, data proposta dal cliente." },
    client: { label: "Preventivi e date", description: "Nuovo preventivo, data confermata o cambiata, preventivo ritirato." },
    types: [
      "NEW_QUOTE",
      "QUOTE_ACCEPTED",
      "QUOTE_REJECTED",
      "QUOTE_WITHDRAWN",
      "QUOTE_DATE_PROPOSED",
      "QUOTE_DATE_CHANGED",
      "QUOTE_DATE_CONFIRMED",
      "QUOTE_DATE_REJECTED",
    ],
    activeChannels: ["inApp"],
  },
  lavori: {
    professional: { label: "Lavori e appuntamenti", description: "Promemoria il giorno prima, prenotazioni riaperte, segnalazioni di assenza." },
    client: { label: "Lavori e appuntamenti", description: "Promemoria il giorno prima, lavoro terminato, intervento annullato." },
    types: [
      "JOB_COMPLETED",
      "BOOKING_CANCELED_BY_PROFESSIONAL",
      "BOOKING_REOPENED_BY_CLIENT",
      "BOOKING_REOPENED_BY_PROFESSIONAL",
      "BOOKING_NO_SHOW_REPORTED",
      "BOOKING_REMINDER",
    ],
    activeChannels: ["inApp", "email"],
  },
  messaggi: {
    professional: { label: "Messaggi", description: "Quando un cliente ti scrive in chat." },
    client: { label: "Messaggi", description: "Quando un professionista ti scrive in chat." },
    types: ["TIMELINE_MESSAGE_FROM_CLIENT", "TIMELINE_MESSAGE_FROM_PROFESSIONAL"],
    activeChannels: ["inApp"],
  },
  promemoria: {
    professional: { label: "Promemoria che imposti tu", description: "Il \"ricordamelo\" scelto dal menu di una richiesta." },
    client: { label: "Promemoria che imposti tu", description: "Il \"ricordamelo\" scelto dal menu di una richiesta." },
    types: ["REQUEST_REMINDER"],
    activeChannels: ["inApp"],
  },
  account: {
    professional: { label: "Account e sicurezza", description: "Decisioni su segnalazioni e sul tuo account. Obbligatorie per legge." },
    client: { label: "Account e sicurezza", description: "Decisioni su segnalazioni e sul tuo account. Obbligatorie per legge." },
    types: [
      "CONTENT_REPORT_DECISION",
      "CONTENT_REPORT_UPHELD",
      "CONTENT_REPORT_REVERTED",
      "CONTENT_REPORT_APPEAL_REJECTED",
      "ACCOUNT_SUSPENDED",
      "ACCOUNT_REACTIVATED",
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
