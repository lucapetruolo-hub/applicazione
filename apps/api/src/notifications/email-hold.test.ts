import { describe, expect, it } from "vitest";
import { resolveNotificationPreferences } from "@professionisti/shared";
import { emailOffToken, readEmailOffToken } from "./email-off";
import { emailHoldUntil, heldEmailGroups, isQuietHour, nextRomeHour } from "./email-hold";
import { notificationOptOuts } from "./opt-outs";
import { heldEmailsSummary } from "../email/templates/notification-emails";

const prefs = resolveNotificationPreferences(null);
// 29 ottobre 2026: ora solare, Italia = UTC+1.
const at = (iso: string) => new Date(iso);

describe("email rimandate", () => {
  it("un avviso senza fretta aspetta il riassunto delle 19", () => {
    expect(emailHoldUntil(prefs, "NEW_REVIEW", {}, at("2026-10-29T09:00:00Z"))?.toISOString()).toBe("2026-10-29T18:00:00.000Z");
    // Dopo le 19 aspetta la sera dopo.
    expect(emailHoldUntil(prefs, "NEW_REVIEW", {}, at("2026-10-29T18:30:00Z"))?.toISOString()).toBe("2026-10-30T18:00:00.000Z");
  });

  it("il riassunto segue l'ora scelta", () => {
    expect(emailHoldUntil({ ...prefs, digestHour: 21 }, "NEW_REVIEW", {}, at("2026-10-29T09:00:00Z"))?.toISOString()).toBe("2026-10-29T20:00:00.000Z");
    // Un'ora non prevista salvata a mano torna alle 19.
    expect(resolveNotificationPreferences({ ...prefs, digestHour: 3 }).digestHour).toBe(19);
  });

  it("di giorno un avviso che chiede un'azione parte subito", () => {
    expect(emailHoldUntil(prefs, "NEW_QUOTE", {}, at("2026-10-29T09:00:00Z"))).toBeNull();
  });

  it("di notte aspetta le 7, anche una richiesta urgente se non si è scelto di riceverla", () => {
    expect(emailHoldUntil(prefs, "NEW_QUOTE", {}, at("2026-10-29T22:30:00Z"))?.toISOString()).toBe("2026-10-30T06:00:00.000Z");
    expect(emailHoldUntil(prefs, "NEW_QUOTE", {}, at("2026-10-30T02:00:00Z"))?.toISOString()).toBe("2026-10-30T06:00:00.000Z");
    expect(emailHoldUntil(prefs, "NEW_LEAD", { isUrgent: true }, at("2026-10-29T23:00:00Z"))?.toISOString()).toBe("2026-10-30T06:00:00.000Z");
    expect(emailHoldUntil({ ...prefs, quietNightUrgent: false }, "NEW_LEAD", { isUrgent: true }, at("2026-10-29T23:00:00Z"))).toBeNull();
    // Di giorno un'urgente parte sempre subito.
    expect(emailHoldUntil(prefs, "NEW_LEAD", { isUrgent: true }, at("2026-10-29T09:00:00Z"))).toBeNull();
  });

  // Email del mattino del professionista (docs/changelog/2026-11-19-email-del-mattino.md).
  it("i promemoria del mattino aspettano le 10:05, anche quelli delle 10 e della notte", () => {
    // 8:00 italiane (29/10, UTC+1): "Lavori da chiudere" aspetta le 10:05.
    expect(emailHoldUntil(prefs, "JOB_TO_CLOSE", {}, at("2026-10-29T07:00:00Z"))?.toISOString()).toBe("2026-10-29T09:05:00.000Z");
    // I promemoria delle 10 partono alle 10:00:0x: stessa email delle 10:05, non il giorno dopo.
    expect(emailHoldUntil(prefs, "AGENDA_REMINDER", {}, at("2026-10-29T09:00:03Z"))?.toISOString()).toBe("2026-10-29T09:05:00.000Z");
    expect(emailHoldUntil(prefs, "REVIEW_REPLY_REMINDER", {}, at("2026-10-29T09:04:59Z"))?.toISOString()).toBe("2026-10-29T09:05:00.000Z");
    // Di notte non aspetta le 7 ma le 10:05, insieme agli altri.
    expect(emailHoldUntil(prefs, "PROFILE_SETUP_REMINDER", {}, at("2026-10-29T02:00:00Z"))?.toISOString()).toBe("2026-10-29T09:05:00.000Z");
    // Dopo le 10:05 valgono le regole di sempre: di giorno subito.
    expect(emailHoldUntil(prefs, "JOB_TO_CLOSE", {}, at("2026-10-29T09:05:00Z"))).toBeNull();
    // D'estate (UTC+2) le 10:05 italiane sono le 8:05 UTC.
    expect(emailHoldUntil(prefs, "AWAY_ENDING", {}, at("2026-07-01T06:00:00Z"))?.toISOString()).toBe("2026-07-01T08:05:00.000Z");
    // Gli altri tipi non cambiano.
    expect(emailHoldUntil(prefs, "NEW_QUOTE", {}, at("2026-10-29T07:00:00Z"))).toBeNull();
  });

  it("con \"Promemoria del mattino tutti insieme\" spento ogni promemoria parte da solo", () => {
    const apart = { ...prefs, morningTogether: false };
    expect(prefs.morningTogether).toBe(true);
    // Di giorno subito, di notte alle 7 come gli altri avvisi.
    expect(emailHoldUntil(apart, "JOB_TO_CLOSE", {}, at("2026-10-29T07:00:00Z"))).toBeNull();
    expect(emailHoldUntil(apart, "PROFILE_SETUP_REMINDER", {}, at("2026-10-29T02:00:00Z"))?.toISOString()).toBe("2026-10-29T06:00:00.000Z");
    expect(resolveNotificationPreferences({ morningTogether: false }).morningTogether).toBe(false);
  });

  it("con le scelte spente parte tutto subito", () => {
    const off = { ...prefs, digest: false, quietNight: false };
    expect(emailHoldUntil(off, "NEW_REVIEW", {}, at("2026-10-29T09:00:00Z"))).toBeNull();
    expect(emailHoldUntil(off, "NEW_QUOTE", {}, at("2026-10-29T23:00:00Z"))).toBeNull();
  });

  it("ore italiane giuste anche d'estate e nel giorno del cambio d'ora", () => {
    expect(isQuietHour(at("2026-07-01T20:30:00Z"))).toBe(true); // 22:30 in Italia
    expect(isQuietHour(at("2026-07-01T19:30:00Z"))).toBe(false);
    expect(nextRomeHour(19, at("2026-07-01T08:00:00Z")).toISOString()).toBe("2026-07-01T17:00:00.000Z");
    // Notte tra 24 e 25 ottobre 2026: le 7 sono già in ora solare.
    expect(nextRomeHour(7, at("2026-10-24T22:30:00Z")).toISOString()).toBe("2026-10-25T06:00:00.000Z");
  });

  it("non rimanda per email ciò che è stato letto sul sito", () => {
    const created = at("2026-10-29T09:00:00Z");
    const groups = heldEmailGroups([
      { id: "a", userId: "u1", type: "NEW_REVIEW", payload: {}, createdAt: created, readAt: null },
      { id: "b", userId: "u1", type: "NEW_REVIEW", payload: {}, createdAt: created, readAt: at("2026-10-29T10:00:00Z") },
      { id: "c", userId: "u1", type: "NEW_REVIEW", payload: {}, createdAt: created, readAt: created },
      { id: "d", userId: "u2", type: "NEW_REVIEW", payload: {}, createdAt: created, readAt: null },
    ]);
    expect(groups.get("u1")?.map((row) => row.id)).toEqual(["a", "c"]);
    expect(groups.get("u2")?.map((row) => row.id)).toEqual(["d"]);
  });
});

describe("link per non ricevere più un'email", () => {
  it("dice chi e cosa, e rifiuta un link cambiato", () => {
    const token = emailOffToken("user-1", { kind: "item", key: "lavori.recensioni", label: "Recensioni" });
    expect(readEmailOffToken(token)).toEqual({ userId: "user-1", target: { kind: "item", key: "lavori.recensioni" } });
    const [body] = token.split(".");
    const forged = Buffer.from("user-2|i:lavori.recensioni").toString("base64url");
    expect(readEmailOffToken(`${forged}.${token.split(".")[1]}`)).toBeNull();
    expect(readEmailOffToken(`${body}.x`)).toBeNull();
  });

  it("non spegne mai gli avvisi sempre attivi", () => {
    expect(readEmailOffToken(emailOffToken("u", { kind: "item", key: "lavori.problemi", label: "x" }))).toBeNull();
    expect(readEmailOffToken(emailOffToken("u", { kind: "topic", topic: "account", label: "x" }))).toBeNull();
    expect(readEmailOffToken(emailOffToken("u", { kind: "topic", topic: "messaggi", label: "x" }))).toEqual({
      userId: "u",
      target: { kind: "topic", topic: "messaggi" },
    });
  });
});

describe("avvisi spenti per l'admin", () => {
  it("conta chi spegne, anche con tutto l'argomento spento, e non conta le scelte di serie", () => {
    const base = resolveNotificationPreferences(null);
    const appointmentsEmailOff = { ...base, items: { ...base.items, "lavori.appuntamenti": { inApp: true, email: false } } };
    const topicOff = { ...base, topics: { ...base.topics, lavori: { ...base.topics.lavori, inApp: false, email: false } }, digest: false };
    const [pro, client] = notificationOptOuts([
      { prefs: null, role: "professional" },
      { prefs: appointmentsEmailOff, role: "professional" },
      { prefs: topicOff, role: "professional" },
      { prefs: null, role: "client" },
    ]);
    expect(pro?.people).toBe(3);
    expect(client?.people).toBe(1);
    expect(pro?.digestOff).toBe(1);
    const row = (key: string) => pro?.rows.find((r) => r.key === key);
    expect(row("lavori")).toMatchObject({ siteOff: 1, emailOff: 1 });
    expect(row("lavori.appuntamenti")).toMatchObject({ siteOff: 1, emailOff: 2 });
    // Recensioni: email spenta di serie, nessuno l'ha accesa.
    expect(row("lavori.recensioni")).toMatchObject({ emailOffByDefault: true, emailOff: 0, emailOn: 0 });
    expect(pro?.rows.some((r) => r.key === "account" || r.key === "lavori.problemi")).toBe(false);
  });
});

describe("email \"Le cose di oggi\"", () => {
  it("con i soli promemoria del mattino ha titolo e pulsante suoi", () => {
    const items = [
      { time: "08:00", subject: "Lavoro da chiudere: Idraulico" },
      { time: "10:00", subject: "Rispondi a una recensione" },
    ];
    const today = heldEmailsSummary(items, { name: "Mario", morning: true, today: true }, "https://sito.example");
    expect(today.title).toBe("Le cose di oggi");
    expect(today.subject).toBe("Le cose di oggi: 2 promemoria");
    expect(today.cta).toEqual({ label: "Apri Oggi", url: "https://sito.example/dashboard" });
    // Senza `today` resta il riassunto della notte.
    expect(heldEmailsSummary(items, { name: "Mario", morning: true }, "https://sito.example").title).toBe("Le novità della notte");
  });
});

// docs/changelog/2026-11-19-completa-profilo-migliorie.md: solo nuove richieste, un conteggio e un pulsante.
describe("riassunto delle sole nuove richieste", () => {
  it("dice quante sono, quante urgenti, e non le elenca", () => {
    const items = Array.from({ length: 12 }, (_, i) => ({ time: "15:00", subject: `Nuova richiesta ${i}`, url: `https://sito.example/r/${i}` }));
    const email = heldEmailsSummary(items, { name: "Mario", morning: false, leads: { urgent: 2 } }, "https://sito.example");
    expect(email.subject).toBe("Ci sono 12 richieste nella tua zona");
    expect(email.title).toBe("Ci sono 12 richieste nella tua zona (2 urgenti)");
    expect(email.details).toBeUndefined();
    expect(email.cta).toEqual({ label: "Vedi le richieste", url: "https://sito.example/dashboard/richieste" });
  });
});
