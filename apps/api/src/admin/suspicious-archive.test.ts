import { describe, expect, it } from "vitest";
import { signalKey, type AdminUserSignal } from "@professionisti/shared";
import { planSuspicious, type StoredSuspicious } from "./suspicious-archive";

/** Archivio degli account sospetti (docs/changelog/2026-10-30-admin-persone.md, 02/11/2026). */
const now = new Date("2026-11-02T07:00:00Z");
const daysAgo = (d: number) => new Date(now.getTime() - d * 24 * 60 * 60 * 1000);
const family: AdminUserSignal = { kind: "SAME_PHONE", detail: "anche Bruno", others: [{ id: "b", label: "Bruno", role: "CLIENT" }] };
const fakeReview: AdminUserSignal = { kind: "REVIEW_SAME_PERSON", detail: "a Idraulica", others: [] };
const people = new Map([
  ["a", { role: "CLIENT" as const }],
  ["p", { role: "PROFESSIONAL" as const }],
]);
const row = (over: Partial<StoredSuspicious>): StoredSuspicious => ({
  userId: "a",
  signals: [family],
  archiveReason: null,
  archivedAt: null,
  archivedKeys: [],
  lastChangedAt: daysAgo(1),
  ...over,
});
const plan = (stored: StoredSuspicious[], signals: [string, AdminUserSignal[]][], measures: [string, "SUSPENDED" | "PROFILE_HIDDEN"][] = []) =>
  planSuspicious({ stored, signals: new Map(signals), people, measures: new Map(measures), now });

describe("archivio degli account sospetti", () => {
  it("nuovo account: resta da gestire", () => {
    expect(plan([], [["a", [fakeReview]]])).toEqual([{ userId: "a", action: "UPSERT", signals: [fakeReview], lastChangedAt: now, isNew: true }]);
  });

  it("segnali spariti (recensione nascosta, account chiuso): archiviato con gli ultimi segnali", () => {
    expect(plan([row({ signals: [fakeReview] })], [])).toMatchObject([{ userId: "a", action: "ARCHIVE", reason: "RESOLVED", signals: [fakeReview] }]);
  });

  it("account sospeso o profilo tolto dalla ricerca: Gestito", () => {
    expect(plan([row({ signals: [fakeReview] })], [["a", [fakeReview]]], [["a", "SUSPENDED"]])).toMatchObject([{ action: "ARCHIVE", reason: "SUSPENDED" }]);
    expect(plan([], [["p", [fakeReview]]], [["p", "PROFILE_HIDDEN"]])).toMatchObject([{ action: "ARCHIVE", reason: "PROFILE_HIDDEN", isNew: true }]);
  });

  it("Nessuna azione senza novità per 90 giorni esce da sola; con meno giorni o con qualcosa da fare no", () => {
    expect(plan([row({ lastChangedAt: daysAgo(91) })], [["a", [family]]])).toMatchObject([{ action: "ARCHIVE", reason: "EXPIRED" }]);
    expect(plan([row({ lastChangedAt: daysAgo(30) })], [["a", [family]]])).toMatchObject([{ action: "UPSERT" }]);
    expect(plan([row({ signals: [fakeReview], lastChangedAt: daysAgo(200) })], [["a", [fakeReview]]])).toMatchObject([{ action: "UPSERT" }]);
  });

  it("un segnale che cambia azzera i 90 giorni", () => {
    const changed = { ...family, detail: "anche Bruno, Carla" };
    expect(plan([row({ lastChangedAt: daysAgo(91) })], [["a", [changed]]])).toMatchObject([{ action: "UPSERT", lastChangedAt: now }]);
  });

  it("archiviato con un segnale nuovo: torna da gestire, tranne con la misura ancora in vigore", () => {
    const archived = row({ archiveReason: "OK", archivedAt: daysAgo(5), archivedKeys: [signalKey(family)] });
    expect(plan([archived], [["a", [family]]])).toMatchObject([{ action: "UPSERT" }]);
    expect(plan([archived], [["a", [family, fakeReview]]])).toMatchObject([{ action: "REOPEN" }]);
    const suspended = row({ archiveReason: "SUSPENDED", archivedAt: daysAgo(5), archivedKeys: [signalKey(family)] });
    expect(plan([suspended], [["a", [family, fakeReview]]], [["a", "SUSPENDED"]])).toMatchObject([{ action: "UPSERT" }]);
    expect(plan([suspended], [["a", [family, fakeReview]]])).toMatchObject([{ action: "REOPEN" }]);
  });

  it("archiviati da più di 2 anni senza segnali: si cancellano", () => {
    expect(plan([row({ archiveReason: "RESOLVED", archivedAt: daysAgo(731) })], [])).toEqual([{ userId: "a", action: "DELETE" }]);
    expect(plan([row({ archiveReason: "RESOLVED", archivedAt: daysAgo(100) })], [])).toEqual([]);
  });
});
