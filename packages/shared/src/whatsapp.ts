import { z } from "zod";
import "./zod";

/**
 * Promemoria su WhatsApp con Meta (decisione di Luca del 28/10/2026,
 * docs/changelog/2026-10-28-promemoria-whatsapp.md). Pochi messaggi, solo
 * quelli in cui arrivare in tempo cambia qualcosa: "cosa succede se arriva
 * 4 ore dopo via email". Mai nulla di promozionale.
 *
 * Tutto il resto (richieste, preventivi, pagamenti, fatture, abbonamento)
 * resta su sito ed email. Aggiungere un tipo qui vuol dire far approvare a
 * Meta un nuovo modello e pagarlo a ogni invio: va discusso con Luca.
 */
export const WHATSAPP_MESSAGE_TYPES = [
  "BOOKING_REMINDER_CLIENT",
  "BOOKING_REMINDER_PROFESSIONAL",
  "PROFESSIONAL_ON_THE_WAY",
  "BOOKING_CANCELED",
  "PHONE_VERIFICATION_CODE",
] as const;
export type WhatsAppMessageType = (typeof WHATSAPP_MESSAGE_TYPES)[number];

/** Cosa arriva su WhatsApp, come lo leggono cliente e professionista in Notifiche. */
export const WHATSAPP_MESSAGES_FOR: Record<
  "client" | "professional",
  string[]
> = {
  client: [
    "Il promemoria prima dell'appuntamento, per dire se ci sarai",
    "L'avviso quando il professionista sta arrivando",
    "L'avviso se il professionista annulla l'appuntamento",
  ],
  professional: [
    "La sera prima, il riepilogo dei lavori del giorno dopo",
    "L'avviso se il cliente annulla l'appuntamento",
  ],
};

/** Ore di silenzio, ora italiana: dalle 21 alle 8 parte solo ciò che non può aspettare. */
export const WHATSAPP_QUIET_START_HOUR = 21;
export const WHATSAPP_QUIET_END_HOUR = 8;

/** Il nome dell'attività nei messaggi, al massimo 30 caratteri. */
export const WHATSAPP_NAME_MAX = 30;

/**
 * Testo sicuro per un parametro di un modello WhatsApp: Meta rifiuta a capo,
 * tabulazioni e più di 4 spazi di fila. Tagliato con "..." oltre `max`.
 */
export function whatsappParam(
  value: string | null | undefined,
  max = 60,
): string {
  const clean = (value ?? "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/ {2,}/g, " ")
    .trim();
  if (!clean) return "-";
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 3);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > max / 2 ? cut.slice(0, lastSpace) : cut).trimEnd()}...`;
}

/** Stato di WhatsApp per chi è entrato (`GET /whatsapp/me`). */
export type WhatsAppStatus = {
  /** Le chiavi di Meta sono su Render: i messaggi partono davvero. */
  available: boolean;
  phone: string | null;
  phoneIsMobile: boolean;
  verified: boolean;
  enabled: boolean;
  /** Numero nascosto a metà a cui è partito un codice ancora valido. */
  codeSentTo: string | null;
  codeValidForSeconds: number;
  codeResendInSeconds: number;
};

/** Admin → WhatsApp (`GET /admin/whatsapp?month=AAAA-MM`). */
export type WhatsAppAdminSummary = {
  available: boolean;
  month: string;
  dailyLimit: number;
  sentToday: number;
  optedInUsers: number;
  verifiedUsers: number;
  costEurCents: number;
  byStatus: Record<string, number>;
  byType: {
    type: string;
    status: string;
    count: number;
    costEurCents: number;
  }[];
  skipped: { reason: string; count: number }[];
  /** Lavori passati (90 giorni, dal lancio) con e senza promemoria consegnato al cliente. */
  reminderEffect: {
    since: string;
    withReminder: { jobs: number; missed: number };
    withoutReminder: { jobs: number; missed: number };
    /** Lavori con un promemoria (WhatsApp consegnato o email) e come ha risposto il cliente. */
    replies: {
      reminded: number;
      confirmed: number;
      cantCome: number;
      noAnswer: number;
      byWhatsApp: number;
      byEmail: number;
    };
    /** Lavori saltati tra chi aveva confermato "Ci sarò" e chi no. */
    confirmedJobs: { jobs: number; missed: number };
    unconfirmedJobs: { jobs: number; missed: number };
  };
  recent: {
    id: string;
    type: string;
    status: string;
    skipReason: string | null;
    error: string | null;
    role: string | null;
    createdAt: string;
    sentAt: string | null;
    deliveredAt: string | null;
    readAt: string | null;
    costEurCents: number;
  }[];
};

/** Codice di 6 cifre arrivato su WhatsApp per confermare il numero. */
export const whatsappCodeSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "Il codice è di 6 cifre"),
});
export type WhatsAppCodeInput = z.infer<typeof whatsappCodeSchema>;
