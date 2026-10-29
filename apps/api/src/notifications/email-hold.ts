import {
  NOTIFICATION_DIGEST_TYPES,
  NOTIFICATION_QUIET_FROM_HOUR,
  NOTIFICATION_QUIET_TO_HOUR,
  notificationDigestHour,
  wallClockNow,
  type NotificationPreferences,
} from "@professionisti/shared";

/**
 * Quando parte l'email di una notifica
 * (docs/changelog/2026-10-29-notifiche-email-riassunto-e-notte.md, richiesta
 * di Luca): gli avvisi senza fretta aspettano il riassunto della sera (alle 19 o all'ora scelta), di notte
 * (22-7) le email aspettano il mattino, anche le richieste urgenti se non si
 * è scelto di riceverle subito. `null` = subito.
 */
export function emailHoldUntil(prefs: NotificationPreferences, type: string, payload: unknown, now: Date = new Date()): Date | null {
  const urgent = isUrgent(payload);
  if (!urgent && prefs.digest && NOTIFICATION_DIGEST_TYPES.has(type)) return nextRomeHour(notificationDigestHour(prefs), now);
  // Le richieste urgenti aspettano solo se la persona l'ha scelto (acceso di serie, scelta di Luca).
  if (prefs.quietNight && isQuietHour(now) && (!urgent || prefs.quietNightUrgent !== false)) return nextRomeHour(NOTIFICATION_QUIET_TO_HOUR, now);
  return null;
}

function isUrgent(payload: unknown): boolean {
  return !!payload && typeof payload === "object" && !Array.isArray(payload) && (payload as Record<string, unknown>).isUrgent === true;
}

/** Ora italiana tra le 22 e le 7. */
export function isQuietHour(now: Date = new Date()): boolean {
  const hour = wallClockNow(now).getUTCHours();
  return hour >= NOTIFICATION_QUIET_FROM_HOUR || hour < NOTIFICATION_QUIET_TO_HOUR;
}

/** Il primo momento, dopo `now`, in cui in Italia sono le `hour`:00 (anche nei giorni del cambio d'ora). */
export function nextRomeHour(hour: number, now: Date = new Date()): Date {
  const wall = wallClockNow(now);
  const target = new Date(wall);
  target.setUTCHours(hour, 0, 0, 0);
  if (target.getTime() <= wall.getTime()) target.setUTCDate(target.getUTCDate() + 1);
  // Scarto tra ora italiana e UTC, preso all'ora d'arrivo.
  const guess = new Date(target.getTime() - (wall.getTime() - now.getTime()));
  const offset = wallClockNow(guess).getTime() - guess.getTime();
  return new Date(Math.round((target.getTime() - offset) / 60_000) * 60_000);
}

export type HeldEmailRow = { id: string; userId: string; type: string; payload: unknown; createdAt: Date; readAt: Date | null };

/**
 * Email rimandate da mandare, per persona. Una notifica già letta sul sito
 * dopo il suo arrivo non si rimanda per email (chi l'ha vista non ha bisogno
 * di un'email in più); quelle nate già lette perché il sito è spento sì.
 */
export function heldEmailGroups(rows: HeldEmailRow[]): Map<string, HeldEmailRow[]> {
  const groups = new Map<string, HeldEmailRow[]>();
  for (const row of rows) {
    if (row.readAt && row.readAt.getTime() - row.createdAt.getTime() > 5_000) continue;
    const list = groups.get(row.userId) ?? [];
    list.push(row);
    groups.set(row.userId, list);
  }
  return groups;
}
