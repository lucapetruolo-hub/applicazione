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

/**
 * Singoli avvisi dentro un argomento (docs/changelog/2026-10-28-notifiche-impostazioni.md,
 * richiesta di Luca): nella pagina Notifiche ogni argomento si apre e si
 * spengono i singoli avvisi (es. "Preventivo rifiutato" sì, "Data proposta"
 * no). Un avviso spento vale per tutti i canali, come un argomento spento:
 * la notifica resta nella cronologia, già letta. Etichette per ruolo: un
 * avviso senza etichetta per quel ruolo non gli si mostra (non lo riceve).
 * "admin" si mostra solo agli amministratori. Ogni tipo di un argomento con
 * avvisi sta in uno solo di questi (controllato dai test).
 */
export type NotificationItem = {
  key: string;
  topic: NotificationTopic;
  types: string[];
  professional?: { label: string; description?: string };
  client?: { label: string; description?: string };
  /** Solo per gli amministratori. */
  admin?: { label: string; description?: string };
  /**
   * Sempre attivo, anche con l'argomento spento: avvisi con scadenze che non
   * si possono perdere (docs/changelog/2026-10-29-notifiche-sempre-attive-e-campanella.md).
   */
  locked?: boolean;
  /** Canali in cui l'avviso esiste davvero, se non sono sia sito sia email. */
  channels?: ItemChannel[];
};

export type ItemChannel = "inApp" | "email";

export const NOTIFICATION_ITEMS: NotificationItem[] = [
  {
    key: "richieste.nuove",
    topic: "richieste",
    types: ["NEW_LEAD"],
    professional: { label: "Nuove richieste", description: "Un cliente ti chiede un preventivo." },
  },
  {
    key: "richieste.inviata",
    topic: "richieste",
    types: ["REQUEST_SENT"],
    // Solo l'email di conferma: sul sito la persona vede già la pagina "Richiesta inviata".
    channels: ["email"],
    client: { label: "Richiesta inviata", description: "L'email con il riepilogo di quello che hai chiesto." },
  },
  {
    key: "richieste.novita",
    topic: "richieste",
    types: ["LEAD_DECLINED", "GUIDED_REQUEST_EXPIRED", "REQUEST_FORWARDED", "REQUEST_FORWARD_NO_MATCH", "REQUEST_MATCHED_LATER"],
    client: { label: "Novità sulla richiesta", description: "Un professionista trovato più tardi, la richiesta inoltrata ad altri, rifiutata o scaduta." },
  },
  {
    key: "preventivi.nuovi",
    topic: "preventivi",
    types: ["NEW_QUOTE"],
    client: { label: "Nuovo preventivo" },
  },
  {
    key: "preventivi.esito",
    topic: "preventivi",
    types: ["QUOTE_ACCEPTED", "QUOTE_REJECTED"],
    professional: { label: "Preventivo accettato o rifiutato" },
  },
  {
    key: "preventivi.modifiche",
    topic: "preventivi",
    types: ["QUOTE_UPDATED", "QUOTE_WITHDRAWN", "QUOTE_DEPOSIT_REFUNDED"],
    client: { label: "Preventivo aggiornato o ritirato" },
  },
  {
    key: "preventivi.date",
    topic: "preventivi",
    types: ["QUOTE_DATE_PROPOSED", "QUOTE_DATE_CHANGED", "QUOTE_DATE_CONFIRMED", "QUOTE_DATE_REJECTED"],
    professional: { label: "Date proposte dal cliente" },
    client: { label: "Data confermata o cambiata" },
  },
  {
    key: "lavori.appuntamenti",
    topic: "lavori",
    types: [
      "BOOKING_CONFIRMED",
      "BOOKING_CANCELED_BY_PROFESSIONAL",
      "BOOKING_CANCELED_BY_CLIENT",
      "BOOKING_REOPENED_BY_CLIENT",
      "BOOKING_REOPENED_BY_PROFESSIONAL",
      "BOOKING_NO_SHOW_REPORTED",
    ],
    professional: { label: "Appuntamenti", description: "Annullati o riaperti dal cliente." },
    client: { label: "Appuntamenti", description: "Prenotati, annullati o riaperti." },
  },
  {
    key: "lavori.promemoria",
    topic: "lavori",
    types: ["BOOKING_REMINDER", "AGENDA_REMINDER", "AGENDA_TOMORROW_SUMMARY", "PROFESSIONAL_ON_THE_WAY"],
    professional: { label: "Promemoria e agenda", description: "Il giorno prima, il riepilogo della sera, l'agenda senza orari liberi." },
    client: { label: "Promemoria", description: "Il giorno prima e quando il professionista sta arrivando." },
  },
  {
    key: "lavori.chiusura",
    topic: "lavori",
    types: ["JOB_COMPLETED", "JOB_CONFIRM_REMINDER", "JOB_AUTO_CONFIRMED", "JOB_CLOSE_REMINDER", "JOB_CLOSE_EXPIRED"],
    professional: { label: "Lavoro terminato", description: "La conferma del cliente e la chiusura del lavoro." },
    client: { label: "Lavoro terminato", description: "Quando il professionista lo segna come finito." },
  },
  {
    key: "lavori.pagamenti",
    topic: "lavori",
    types: [
      "JOB_DEPOSIT_PAID",
      "JOB_BALANCE_PAID",
      "JOB_BALANCE_DUE",
      "JOB_BALANCE_AUTO_CHARGED",
      "JOB_BALANCE_UNPAID",
      "JOB_PAYOUT_SENT",
      "JOB_PAYOUT_ACCOUNT_NEEDED",
      "JOB_PAYOUT_FAILED",
      "JOB_PAYMENT_DEBT",
      "JOB_REFUND_PENDING",
      "JOB_REFUND_COMPLETED",
      "JOB_REFUND_WAITING_FUNDS",
      "ONLINE_LIMIT_LIFTED",
    ],
    professional: { label: "Pagamenti online", description: "Acconti e saldi pagati, bonifici, rimborsi." },
    client: { label: "Pagamenti online", description: "Saldo da pagare e rimborsi." },
  },
  {
    key: "lavori.problemi",
    topic: "lavori",
    types: [
      "JOB_ISSUE_REPORTED",
      "JOB_ISSUE_RESOLVED",
      "JOB_ISSUE_SETTLED",
      "JOB_ISSUE_ESCALATED",
      "JOB_ISSUE_AUTO_ESCALATED",
      "JOB_ISSUE_TEAM_REVIEW",
      "JOB_ISSUE_INFO_REQUESTED",
      "JOB_ISSUE_APPEAL_DECIDED",
      "JOB_ISSUE_UNRESOLVED",
      "JOB_STRIPE_DISPUTE",
      "JOB_STRIPE_DISPUTE_NOTE_DUE",
    ],
    // Risposta in chat entro 48 ore, versione al team entro 72, prove della
    // contestazione: perdere l'avviso vuol dire perdere la segnalazione.
    locked: true,
    professional: { label: "Problemi e contestazioni", description: "Segnalazioni dei clienti e contestazioni in banca: hanno delle scadenze." },
    client: { label: "Le tue segnalazioni", description: "Risposte e decisioni sui problemi che segnali." },
  },
  {
    key: "lavori.recensioni",
    topic: "lavori",
    types: ["NEW_REVIEW"],
    professional: { label: "Nuove recensioni" },
  },
  {
    key: "lavori.documenti",
    topic: "lavori",
    types: ["JOB_INVOICE_REQUESTED", "CLIENT_DOCUMENTS_TO_FIX", "JOB_DOCUMENT_READY"],
    professional: { label: "Fatture chieste dai clienti", description: "E i documenti da sistemare prima del riepilogo dell'anno." },
    client: { label: "Ricevute e fatture", description: "Quando la copia è pronta o aggiornata." },
  },
  {
    key: "lavori.admin",
    topic: "lavori",
    types: [
      "ADMIN_JOB_BALANCE_UNPAID",
      "ADMIN_STRIPE_DISPUTE",
      "ADMIN_STRIPE_DISPUTE_DUE",
      "ADMIN_JOB_REFUND_FAILED",
      "ADMIN_STRIPE_ACCOUNT_UNREADABLE",
      "ADMIN_DAC7_NEEDS_CORRECTION",
      "ADMIN_URGENCY_ALERT",
      "ADMIN_SEARCH_DEMAND_ALERT",
      "ADMIN_WEEKLY_ADVICE",
      "ADMIN_JOB_NOT_CLOSED",
      "ADMIN_JOB_PAYMENT_LONG_HOLD",
      "ADMIN_FEE_RECONCILIATION",
    ],
    admin: { label: "Avvisi per l'amministrazione", description: "Pagamenti da controllare, contestazioni, consigli del lunedì." },
  },
];

const NOTIFICATION_ITEM_KEYS = new Set(NOTIFICATION_ITEMS.filter((item) => !item.locked).map((item) => item.key));

export function notificationItemOf(type: string): NotificationItem | null {
  return NOTIFICATION_ITEMS.find((item) => item.types.includes(type)) ?? null;
}

/** Avvisi di un argomento da mostrare a chi ha quel ruolo (gli amministratori vedono anche i loro). */
export function notificationItemsFor(topic: NotificationTopic, role: "professional" | "client", isAdmin = false): (NotificationItem & { copy: { label: string; description?: string } })[] {
  return NOTIFICATION_ITEMS.filter((item) => item.topic === topic).flatMap((item) => {
    const copy = item[role] ?? (isAdmin ? item.admin : undefined);
    return copy ? [{ ...item, copy }] : [];
  });
}

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
  /**
   * Canali dei singoli avvisi (`NotificationItem.key`), solo quelli cambiati:
   * un avviso parte su un canale se è acceso sia qui sia nell'argomento.
   */
  items: z.record(z.string().max(60), z.object({ inApp: z.boolean(), email: z.boolean() })).optional(),
  /** Email senza fretta raccolte in un riassunto la sera (docs/changelog/2026-10-29-notifiche-email-riassunto-e-notte.md). */
  digest: z.boolean().optional(),
  /** Dalle 22 alle 7 le email aspettano il mattino, tranne le richieste urgenti. */
  quietNight: z.boolean().optional(),
  /** Ora della sera (18-21) del riassunto e del riepilogo dei lavori di domani. */
  digestHour: z.number().int().min(18).max(21).optional(),
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
  // Impostazioni leggere fin dal primo giorno (docs/changelog/2026-10-29-notifiche-email-riassunto-e-notte.md):
  // le recensioni si vedono sul sito e nel profilo, l'email non serve a fare nulla.
  items: { "lavori.recensioni": { inApp: true, email: false } },
  digest: true,
  quietNight: true,
  digestHour: 19,
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
    if (typeof s.digest === "boolean") base.digest = s.digest;
    if (typeof s.quietNight === "boolean") base.quietNight = s.quietNight;
    if (typeof s.digestHour === "number" && (NOTIFICATION_DIGEST_HOURS as readonly number[]).includes(s.digestHour)) base.digestHour = s.digestHour;
    if (s.items && typeof s.items === "object") {
      const items: Record<string, { inApp: boolean; email: boolean }> = {};
      for (const [key, value] of Object.entries(s.items as Record<string, unknown>)) {
        if (!NOTIFICATION_ITEM_KEYS.has(key) || !value || typeof value !== "object") continue;
        const v = value as Record<string, unknown>;
        const entry = { inApp: v.inApp !== false, email: v.email !== false };
        if (!entry.inApp || !entry.email) items[key] = entry;
      }
      base.items = items;
    }
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
  const item = notificationItemOf(type);
  if (item?.locked && channel !== "sms") return true;
  if (item && channel !== "sms" && prefs.items?.[item.key]?.[channel] === false) return false;
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

/**
 * "Non avvisarmi più di questi" dalla campanella
 * (docs/changelog/2026-10-29-notifiche-sempre-attive-e-campanella.md): spegne
 * il singolo avviso o, per un argomento senza avvisi separati (Messaggi,
 * Promemoria), l'argomento su sito ed email. `null` per ciò che non si spegne.
 */
export type NotificationMuteTarget = { kind: "item"; key: string; label: string } | { kind: "topic"; topic: NotificationTopic; label: string };

export function notificationMuteTarget(type: string, role: "professional" | "client", isAdmin = false): NotificationMuteTarget | null {
  const topic = notificationTopicOf(type);
  if (!topic || NOTIFICATION_TOPIC_INFO[topic].locked) return null;
  const item = notificationItemOf(type);
  if (item) {
    if (item.locked) return null;
    const copy = item[role] ?? (isAdmin ? item.admin : undefined);
    return copy ? { kind: "item", key: item.key, label: copy.label } : null;
  }
  return { kind: "topic", topic, label: NOTIFICATION_TOPIC_INFO[topic][role].label };
}

/** Canale acceso per un singolo avviso (senza contare l'argomento). */
export function notificationItemChannelOn(prefs: NotificationPreferences, key: string, channel: ItemChannel): boolean {
  return prefs.items?.[key]?.[channel] !== false;
}

/** Preferenze con un canale di un singolo avviso acceso o spento. */
export function withNotificationItemChannel(prefs: NotificationPreferences, key: string, channel: ItemChannel, on: boolean): NotificationPreferences {
  const next: NotificationPreferences = JSON.parse(JSON.stringify(prefs));
  const entry = { inApp: notificationItemChannelOn(prefs, key, "inApp"), email: notificationItemChannelOn(prefs, key, "email"), [channel]: on };
  const items = { ...(next.items ?? {}) };
  if (entry.inApp && entry.email) delete items[key];
  else items[key] = entry;
  next.items = items;
  return next;
}

/** Preferenze con l'avviso spento (`mute: true`) o di nuovo acceso. */
export function withNotificationMuted(prefs: NotificationPreferences, target: NotificationMuteTarget, mute: boolean): NotificationPreferences {
  const next: NotificationPreferences = JSON.parse(JSON.stringify(prefs));
  if (target.kind === "item") {
    const items = { ...(next.items ?? {}) };
    if (mute) items[target.key] = { inApp: false, email: false };
    else delete items[target.key];
    next.items = items;
  } else {
    next.topics[target.topic].inApp = !mute;
    next.topics[target.topic].email = !mute;
  }
  return next;
}

/**
 * Email senza fretta: con il riassunto acceso non partono subito ma tutte
 * insieme la sera (docs/changelog/2026-10-29-notifiche-email-riassunto-e-notte.md).
 * Solo notizie che non chiedono di fare qualcosa a breve.
 */
export const NOTIFICATION_DIGEST_TYPES: ReadonlySet<string> = new Set([
  "NEW_REVIEW",
  "JOB_DEPOSIT_PAID",
  "JOB_BALANCE_PAID",
  "JOB_BALANCE_AUTO_CHARGED",
  "JOB_PAYOUT_SENT",
  "JOB_REFUND_PENDING",
  "JOB_REFUND_COMPLETED",
  "JOB_AUTO_CONFIRMED",
  "JOB_DOCUMENT_READY",
  "ONLINE_LIMIT_LIFTED",
  "REQUEST_MATCHED_LATER",
  "REQUEST_FORWARDED",
  "SUBSCRIPTION_RENEWED",
  "SUBSCRIPTION_BONUS_MONTH",
  "PROFILE_VERIFIED",
  "STRIPE_ACCOUNT_ACTIVE",
  "MONTHLY_DOCUMENTS_READY",
]);

/** Ora (italiana) del riassunto della sera e fascia della notte senza email. */
export const NOTIFICATION_DIGEST_HOUR = 19;
/**
 * Ore della sera tra cui scegliere (richiesta di Luca, 29/10/2026): la stessa
 * ora vale per il riassunto delle email e per il riepilogo dei lavori di
 * domani.
 */
export const NOTIFICATION_DIGEST_HOURS = [18, 19, 20, 21] as const;

/** Ora della sera scelta, o quella di serie. */
export function notificationDigestHour(prefs: NotificationPreferences): number {
  return prefs.digestHour ?? NOTIFICATION_DIGEST_HOUR;
}
export const NOTIFICATION_QUIET_FROM_HOUR = 22;
export const NOTIFICATION_QUIET_TO_HOUR = 7;
