import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  NOTIFICATION_ITEMS,
  NOTIFICATION_TOPIC_INFO,
  notificationChannelEnabled,
  notificationItemsFor,
  resolveNotificationPreferences,
} from "./notifications";

test("ogni tipo di richieste, preventivi e lavori sta in un solo avviso del suo argomento", () => {
  for (const topic of ["richieste", "preventivi", "lavori"] as const) {
    for (const type of NOTIFICATION_TOPIC_INFO[topic].types) {
      const owners = NOTIFICATION_ITEMS.filter((item) => item.types.includes(type));
      assert.equal(owners.length, 1, `${type}: ${owners.length} avvisi`);
      assert.equal(owners[0]!.topic, topic, `${type} è in ${owners[0]!.topic}`);
    }
  }
  for (const item of NOTIFICATION_ITEMS) {
    for (const type of item.types) assert.ok(NOTIFICATION_TOPIC_INFO[item.topic].types.includes(type), `${type} non è in ${item.topic}`);
  }
});

test("un avviso spento non parte su nessun canale, gli altri sì", () => {
  const prefs = resolveNotificationPreferences({ ...DEFAULT_NOTIFICATION_PREFERENCES, off: ["preventivi.date"] });
  assert.equal(notificationChannelEnabled(prefs, "QUOTE_DATE_PROPOSED", "inApp"), false);
  assert.equal(notificationChannelEnabled(prefs, "QUOTE_DATE_PROPOSED", "email"), false);
  assert.equal(notificationChannelEnabled(prefs, "QUOTE_ACCEPTED", "email"), true);
});

test("chiavi sconosciute o doppie si scartano, senza preferenze nulla è spento", () => {
  assert.deepEqual(resolveNotificationPreferences({ off: ["lavori.recensioni", "boh", "lavori.recensioni", 3] }).off, ["lavori.recensioni"]);
  assert.deepEqual(resolveNotificationPreferences(null).off, []);
});

test("Account e sicurezza non si spegne neppure con un avviso spento", () => {
  const prefs = resolveNotificationPreferences({ off: ["lavori.recensioni"] });
  assert.equal(notificationChannelEnabled(prefs, "ACCOUNT_SUSPENDED", "email"), true);
});

test("gli avvisi per l'amministrazione si mostrano solo agli admin", () => {
  assert.ok(!notificationItemsFor("lavori", "professional").some((item) => item.key === "lavori.admin"));
  assert.ok(notificationItemsFor("lavori", "professional", true).some((item) => item.key === "lavori.admin"));
  assert.ok(!notificationItemsFor("lavori", "client").some((item) => item.key === "lavori.recensioni"));
});
