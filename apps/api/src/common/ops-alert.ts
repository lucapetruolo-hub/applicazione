import * as Sentry from "@sentry/nestjs";

/** Lo stesso avviso al massimo una volta l'ora: resta nella quota gratuita di Sentry. */
const ALERT_WINDOW_MS = 60 * 60_000;
const lastSent = new Map<string, number>();

/**
 * Avviso a chi gestisce il sito per un servizio esterno che smette di
 * funzionare senza dare un errore 500 (docs/CHANGELOG.md §319): per esempio
 * i suggerimenti di indirizzo di Google, che il cliente vede solo come campi
 * separati. Senza `SENTRY_DSN` non fa nulla (Sentry non è inizializzato).
 */
export function opsAlert(key: string, message: string, now = Date.now()): boolean {
  const last = lastSent.get(key);
  if (last !== undefined && now - last < ALERT_WINDOW_MS) return false;
  lastSent.set(key, now);
  Sentry.captureMessage(message, "warning");
  return true;
}
