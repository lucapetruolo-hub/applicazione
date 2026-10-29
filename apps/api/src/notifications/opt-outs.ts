import type { PrismaClient } from "@professionisti/database";
import { COUNTED_USER } from "../site-counts/counted";
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  NOTIFICATION_TOPICS,
  NOTIFICATION_TOPIC_INFO,
  notificationItemChannelOn,
  notificationItemsFor,
  resolveNotificationPreferences,
  type NotificationPreferences,
} from "@professionisti/shared";

export type NotificationOptOutRow = {
  key: string;
  label: string;
  /** Argomento o singolo avviso dentro l'argomento. */
  level: "topic" | "item";
  /** Persone che hanno spento il sito / l'email rispetto alla scelta di serie. */
  siteOff: number;
  emailOff: number;
  /** L'email è spenta di serie: `emailOn` conta chi l'ha accesa. */
  emailOffByDefault: boolean;
  emailOn: number;
  hasSite: boolean;
  hasEmail: boolean;
};

export type NotificationOptOutGroup = {
  role: "professional" | "client";
  people: number;
  digestOff: number;
  quietNightOff: number;
  /** Con la notte senza email accesa, chi vuole comunque le richieste urgenti subito. */
  urgentAtNight: number;
  rows: NotificationOptOutRow[];
};

/**
 * Quante persone spengono ogni avviso (Admin → Statistiche,
 * docs/changelog/2026-10-29-notifiche-email-riassunto-e-notte.md): se un
 * avviso lo spengono in tanti, forse è troppo frequente o scritto male.
 * Un avviso conta come spento anche quando è spento tutto il suo argomento.
 */
export function notificationOptOuts(users: { prefs: unknown; role: "professional" | "client" }[]): NotificationOptOutGroup[] {
  const defaults = DEFAULT_NOTIFICATION_PREFERENCES;
  return (["professional", "client"] as const).map((role) => {
    const list = users.filter((user) => user.role === role).map((user) => resolveNotificationPreferences(user.prefs ?? null));
    const count = (test: (prefs: NotificationPreferences) => boolean) => list.filter(test).length;
    const rows: NotificationOptOutRow[] = [];
    for (const topic of NOTIFICATION_TOPICS) {
      const info = NOTIFICATION_TOPIC_INFO[topic];
      if (info.locked) continue;
      rows.push({
        key: topic,
        label: info[role].label,
        level: "topic",
        siteOff: count((prefs) => !prefs.topics[topic].inApp),
        emailOff: count((prefs) => !prefs.topics[topic].email),
        emailOffByDefault: false,
        emailOn: 0,
        hasSite: true,
        hasEmail: true,
      });
      const items = notificationItemsFor(topic, role);
      if (items.length < 2) continue;
      for (const item of items) {
        if (item.locked) continue;
        const has = (channel: "inApp" | "email") => !item.channels || item.channels.includes(channel);
        const on = (prefs: NotificationPreferences, channel: "inApp" | "email") => prefs.topics[topic][channel] && notificationItemChannelOn(prefs, item.key, channel);
        const emailOffByDefault = !notificationItemChannelOn(defaults, item.key, "email");
        rows.push({
          key: item.key,
          label: item.copy.label,
          level: "item",
          siteOff: has("inApp") ? count((prefs) => !on(prefs, "inApp")) : 0,
          emailOff: has("email") && !emailOffByDefault ? count((prefs) => !on(prefs, "email")) : 0,
          emailOffByDefault,
          emailOn: has("email") && emailOffByDefault ? count((prefs) => on(prefs, "email")) : 0,
          hasSite: has("inApp"),
          hasEmail: has("email"),
        });
      }
    }
    return {
      role,
      people: list.length,
      digestOff: count((prefs) => !prefs.digest),
      quietNightOff: count((prefs) => !prefs.quietNight),
      urgentAtNight: count((prefs) => !!prefs.quietNight && prefs.quietNightUrgent === false),
      rows,
    };
  });
}

/** Le preferenze di tutti, senza account di prova, chiusi e admin. */
export async function loadNotificationOptOuts(prisma: PrismaClient): Promise<NotificationOptOutGroup[]> {
  const users = await prisma.user.findMany({
    where: { ...COUNTED_USER, deletedAt: null, role: { not: "ADMIN" } },
    select: { notificationPrefs: true, professionalProfile: { select: { id: true } } },
  });
  return notificationOptOuts(users.map((user) => ({ prefs: user.notificationPrefs, role: user.professionalProfile ? "professional" : "client" })));
}
