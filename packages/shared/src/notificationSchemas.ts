import { z } from "zod";
import "./zod";

/** Preferenze di notifica salvate (argomenti e canali in `notifications.ts`). */
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
  /**
   * Canali dei singoli avvisi (`NotificationItem.key`), solo quelli cambiati:
   * un avviso parte su un canale se è acceso sia qui sia nell'argomento.
   */
  items: z.record(z.string().max(60), z.object({ inApp: z.boolean(), email: z.boolean() })).optional(),
  /** Email senza fretta raccolte in un riassunto la sera (docs/changelog/2026-10-29-notifiche-email-riassunto-e-notte.md). */
  digest: z.boolean().optional(),
  /** Dalle 22 alle 7 le email aspettano il mattino, tranne le richieste urgenti. */
  quietNight: z.boolean().optional(),
  /** Di notte aspettano il mattino anche le richieste urgenti (scelta di Luca, 29/10/2026: acceso di serie). */
  quietNightUrgent: z.boolean().optional(),
  /** Ora della sera (18-21) del riassunto e del riepilogo dei lavori di domani. */
  digestHour: z.number().int().min(18).max(21).optional(),
});
export type NotificationPreferences = z.infer<typeof notificationPreferencesSchema>;
