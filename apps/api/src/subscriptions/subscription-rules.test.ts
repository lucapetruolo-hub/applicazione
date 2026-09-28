import { describe, expect, it } from "vitest";
import { monthlyLimit, romeMonthKey, romeMonthStart, subscriptionState, tierOfPlan, usageNoticeToSend } from "./subscription-rules";

const NOW = new Date("2026-09-28T10:00:00Z");
const future = new Date("2026-10-10T00:00:00Z");
const past = new Date("2026-09-01T00:00:00Z");

describe("mese in ora italiana", () => {
  it("inizio mese d'estate: 1 settembre 00:00 Roma = 31 agosto 22:00 UTC", () => {
    expect(romeMonthStart(NOW).toISOString()).toBe("2026-08-31T22:00:00.000Z");
  });
  it("inizio mese d'inverno: 1 gennaio 00:00 Roma = 31 dicembre 23:00 UTC", () => {
    expect(romeMonthStart(new Date("2027-01-15T12:00:00Z")).toISOString()).toBe("2026-12-31T23:00:00.000Z");
  });
  it("la notte del 30 settembre alle 23:30 UTC è già ottobre a Roma", () => {
    expect(romeMonthKey(new Date("2026-09-30T23:30:00Z"))).toBe("2026-10");
  });
});

describe("stato e limite", () => {
  it("il vecchio piano BUSINESS vale come Pro, FREE come nessun livello", () => {
    expect(tierOfPlan("BUSINESS")).toBe("PRO");
    expect(tierOfPlan("FREE")).toBeNull();
  });
  it("prova in corso: nessun limite", () => {
    const row = { plan: "FREE", status: "TRIALING", trialEndsAt: future };
    expect(subscriptionState(row, NOW)).toBe("TRIAL");
    expect(monthlyLimit(row, NOW)).toBeNull();
  });
  it("prova finita senza livello: TRIAL_ENDED, nessun limite (nessun blocco)", () => {
    const row = { plan: "FREE", status: "TRIALING", trialEndsAt: past };
    expect(subscriptionState(row, NOW)).toBe("TRIAL_ENDED");
    expect(monthlyLimit(row, NOW)).toBeNull();
  });
  it("Base attivo: 5 lavori, Plus 15, Pro senza limite", () => {
    expect(monthlyLimit({ plan: "BASE", status: "ACTIVE", trialEndsAt: null }, NOW)).toBe(5);
    expect(monthlyLimit({ plan: "PLUS", status: "ACTIVE", trialEndsAt: null }, NOW)).toBe(15);
    expect(monthlyLimit({ plan: "PRO", status: "ACTIVE", trialEndsAt: null }, NOW)).toBeNull();
  });
});

it("livello scelto durante la prova: nessun limite fino alla fine della prova", () => {
  expect(monthlyLimit({ plan: "BASE", status: "ACTIVE", trialEndsAt: future }, NOW)).toBeNull();
  expect(monthlyLimit({ plan: "BASE", status: "ACTIVE", trialEndsAt: past }, NOW)).toBe(5);
});

describe("avvisi di utilizzo (80% e 100%)", () => {
  it("Base: avviso all'80% al 4° lavoro, al 100% al 5°, una sola volta al mese", () => {
    expect(usageNoticeToSend(3, 5, null, "2026-09")).toBeNull();
    expect(usageNoticeToSend(4, 5, null, "2026-09")).toBe("80");
    expect(usageNoticeToSend(4, 5, "2026-09:80", "2026-09")).toBeNull();
    expect(usageNoticeToSend(5, 5, "2026-09:80", "2026-09")).toBe("100");
    expect(usageNoticeToSend(6, 5, "2026-09:100", "2026-09")).toBeNull();
  });
  it("il mese nuovo riparte da zero", () => {
    expect(usageNoticeToSend(4, 5, "2026-08:100", "2026-09")).toBe("80");
  });
  it("senza limite nessun avviso", () => {
    expect(usageNoticeToSend(100, null, null, "2026-09")).toBeNull();
  });
});
