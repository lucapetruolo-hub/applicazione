import type { NotificationPreferences } from "./notificationSchemas";

// Preferenze di partenza in un file a parte: AuthContext le usa su ogni
// pagina del sito, e da notifications.ts portavano con sé l'elenco di tutte
// le notifiche (docs/changelog/2026-11-09-meno-javascript-comune.md).

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
  // Impostazioni leggere fin dal primo giorno (docs/changelog/2026-10-29-notifiche-email-riassunto-e-notte.md):
  // le recensioni si vedono sul sito e nel profilo, l'email non serve a fare nulla.
  items: { "lavori.recensioni": { inApp: true, email: false } },
  digest: true,
  quietNight: true,
  quietNightUrgent: true,
  digestHour: 19,
};
