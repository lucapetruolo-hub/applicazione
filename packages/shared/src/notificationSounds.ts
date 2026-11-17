// File senza zod: lo usa anche notifications.ts, che entra in ogni pagina del sito.

/**
 * Suoni a scelta per le notifiche (docs/changelog/2026-11-17-suoni-notifica.md).
 * Il primo è quello di serie; i suoni veri sono in apps/web/src/lib/notificationSound.ts.
 */
export const NOTIFICATION_SOUND_KEYS = ["dolce", "vetro", "goccia", "marimba", "bolla", "campanella", "classico"] as const;
export type NotificationSoundKey = (typeof NOTIFICATION_SOUND_KEYS)[number];
