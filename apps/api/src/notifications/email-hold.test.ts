import { describe, expect, it } from "vitest";
import { resolveNotificationPreferences } from "@professionisti/shared";
import { emailOffToken, readEmailOffToken } from "./email-off";
import { emailHoldUntil, heldEmailGroups, isQuietHour, nextRomeHour } from "./email-hold";
import { notificationOptOuts } from "./opt-outs";

const prefs = resolveNotificationPreferences(null);
// 29 ottobre 2026: ora solare, Italia = UTC+1.
const at = (iso: string) => new Date(iso);

describe("email rimandate", () => {
  it("un avviso senza fretta aspetta il riassunto delle 19", () => {
    expect(emailHoldUntil(prefs, "NEW_REVIEW", {}, at("2026-10-29T09:00:00Z"))?.toISOString()).toBe("2026-10-29T18:00:00.000Z");
    // Dopo le 19 aspetta la sera dopo.
    expect(emailHoldUntil(prefs, "NEW_REVIEW", {}, at("2026-10-29T18:30:00Z"))?.toISOString()).toBe("2026-10-30T18:00:00.000Z");
  });

  it("di giorno un avviso che chiede un'azione parte subito", () => {
    expect(emailHoldUntil(prefs, "NEW_QUOTE", {}, at("2026-10-29T09:00:00Z"))).toBeNull();
  });

  it("di notte aspetta le 7, tranne una richiesta urgente", () => {
    expect(emailHoldUntil(prefs, "NEW_QUOTE", {}, at("2026-10-29T22:30:00Z"))?.toISOString()).toBe("2026-10-30T06:00:00.000Z");
    expect(emailHoldUntil(prefs, "NEW_QUOTE", {}, at("2026-10-30T02:00:00Z"))?.toISOString()).toBe("2026-10-30T06:00:00.000Z");
    expect(emailHoldUntil(prefs, "NEW_LEAD", { isUrgent: true }, at("2026-10-29T23:00:00Z"))).toBeNull();
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
