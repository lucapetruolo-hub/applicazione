import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  NOTIFICATION_ITEMS,
  NOTIFICATION_TOPIC_INFO,
  notificationChannelEnabled,
  notificationItemsFor,
  notificationMuteTarget,
  resolveNotificationPreferences,
  withNotificationItemChannel,
  withNotificationMuted,
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

test("ogni avviso sceglie sito ed email, gli altri restano come l'argomento", () => {
  const base = resolveNotificationPreferences(null);
  const prefs = withNotificationItemChannel(base, "preventivi.date", "email", false);
  assert.equal(notificationChannelEnabled(prefs, "QUOTE_DATE_PROPOSED", "inApp"), true);
  assert.equal(notificationChannelEnabled(prefs, "QUOTE_DATE_PROPOSED", "email"), false);
  assert.equal(notificationChannelEnabled(prefs, "QUOTE_ACCEPTED", "email"), true);
  // L'argomento spento sul sito vale anche per l'avviso acceso.
  const topicOff = JSON.parse(JSON.stringify(prefs));
  topicOff.topics.preventivi.inApp = false;
  assert.equal(notificationChannelEnabled(topicOff, "QUOTE_DATE_PROPOSED", "inApp"), false);
  // Riacceso, la voce sparisce dalle preferenze salvate.
  assert.deepEqual(withNotificationItemChannel(prefs, "preventivi.date", "email", true).items, {});
});

test("chiavi sconosciute e voci tutte accese si scartano, senza preferenze nulla è spento", () => {
  const prefs = resolveNotificationPreferences({ items: { "lavori.recensioni": { inApp: false, email: true }, boh: { inApp: false }, "preventivi.date": { inApp: true, email: true } } });
  assert.deepEqual(prefs.items, { "lavori.recensioni": { inApp: false, email: true } });
  assert.deepEqual(resolveNotificationPreferences(null).items, {});
});

test("Account e sicurezza non si spegne neppure con un avviso spento", () => {
  const prefs = resolveNotificationPreferences({ items: { "lavori.recensioni": { inApp: false, email: false } } });
  assert.equal(notificationChannelEnabled(prefs, "ACCOUNT_SUSPENDED", "email"), true);
});

test("gli avvisi per l'amministrazione si mostrano solo agli admin", () => {
  assert.ok(!notificationItemsFor("lavori", "professional").some((item) => item.key === "lavori.admin"));
  assert.ok(notificationItemsFor("lavori", "professional", true).some((item) => item.key === "lavori.admin"));
  assert.ok(!notificationItemsFor("lavori", "client").some((item) => item.key === "lavori.recensioni"));
});

test("problemi e contestazioni restano attivi anche con Lavori spento", () => {
  const stored = JSON.parse(JSON.stringify(DEFAULT_NOTIFICATION_PREFERENCES));
  stored.topics.lavori = { inApp: false, email: false, sms: false };
  stored.items = { "lavori.problemi": { inApp: false, email: false } };
  const prefs = resolveNotificationPreferences(stored);
  assert.deepEqual(prefs.items, {});
  assert.equal(notificationChannelEnabled(prefs, "JOB_ISSUE_REPORTED", "email"), true);
  assert.equal(notificationChannelEnabled(prefs, "JOB_STRIPE_DISPUTE", "inApp"), true);
  assert.equal(notificationChannelEnabled(prefs, "NEW_REVIEW", "inApp"), false);
});

test("dalla campanella si spegne l'avviso giusto e si riaccende", () => {
  const base = resolveNotificationPreferences(null);
  const review = notificationMuteTarget("NEW_REVIEW", "professional");
  assert.deepEqual(review, { kind: "item", key: "lavori.recensioni", label: "Nuove recensioni" });
  const muted = withNotificationMuted(base, review!, true);
  assert.equal(notificationChannelEnabled(muted, "NEW_REVIEW", "email"), false);
  assert.equal(notificationChannelEnabled(withNotificationMuted(muted, review!, false), "NEW_REVIEW", "email"), true);

  const chat = notificationMuteTarget("TIMELINE_MESSAGE_FROM_CLIENT", "professional");
  assert.equal(chat?.kind, "topic");
  const chatMuted = withNotificationMuted(base, chat!, true);
  assert.equal(notificationChannelEnabled(chatMuted, "TIMELINE_MESSAGE_FROM_CLIENT", "inApp"), false);

  assert.equal(notificationMuteTarget("JOB_ISSUE_REPORTED", "professional"), null);
  assert.equal(notificationMuteTarget("ACCOUNT_SUSPENDED", "client"), null);
  assert.equal(notificationMuteTarget("ADMIN_WEEKLY_ADVICE", "professional"), null);
  assert.equal(notificationMuteTarget("ADMIN_WEEKLY_ADVICE", "professional", true)?.kind, "item");
});
