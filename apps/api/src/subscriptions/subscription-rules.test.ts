import { describe, expect, it } from "vitest";
import { hasLaunched, launchDate, monthlyLimit, pauseReason, periodNoticeToSend, romeMonthKey, romeMonthStart, subscriptionState, tierOfPlan, trialEndFor, usageNoticeToSend } from "./subscription-rules";

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
  it("mese gratuito in corso: vale come Base (5 lavori)", () => {
    const row = { plan: "FREE", status: "TRIALING", trialEndsAt: future };
    expect(subscriptionState(row, NOW)).toBe("TRIAL");
    expect(monthlyLimit(row, NOW)).toBe(5);
  });
  it("prova finita senza livello: TRIAL_ENDED", () => {
    const row = { plan: "FREE", status: "TRIALING", trialEndsAt: past };
    expect(subscriptionState(row, NOW)).toBe("TRIAL_ENDED");
    expect(monthlyLimit(row, NOW)).toBeNull();
  });
  it("una riga attiva senza livello (vecchio piano gratuito) vale come prova finita", () => {
    expect(subscriptionState({ plan: "FREE", status: "ACTIVE", trialEndsAt: null }, NOW)).toBe("TRIAL_ENDED");
  });
  it("annullato: attivo fino alla scadenza, poi concluso anche senza webhook", () => {
    const row = { plan: "BASE", status: "ACTIVE", trialEndsAt: null, cancelAtPeriodEnd: true };
    expect(subscriptionState({ ...row, currentPeriodEnd: future }, NOW)).toBe("ACTIVE");
    expect(subscriptionState({ ...row, currentPeriodEnd: past }, NOW)).toBe("CANCELED");
  });
  it("Base attivo: 5 lavori, Plus 15, Pro senza limite", () => {
    expect(monthlyLimit({ plan: "BASE", status: "ACTIVE", trialEndsAt: null }, NOW)).toBe(5);
    expect(monthlyLimit({ plan: "PLUS", status: "ACTIVE", trialEndsAt: null }, NOW)).toBe(15);
    expect(monthlyLimit({ plan: "PRO", status: "ACTIVE", trialEndsAt: null }, NOW)).toBeNull();
  });
});

it("livello scelto durante la prova: vale subito il limite del livello", () => {
  expect(monthlyLimit({ plan: "BASE", status: "ACTIVE", trialEndsAt: future }, NOW)).toBe(5);
  expect(monthlyLimit({ plan: "PLUS", status: "ACTIVE", trialEndsAt: future }, NOW)).toBe(15);
});

describe("account in pausa", () => {
  it("mese gratuito: operativo fino al 5° lavoro, in pausa al 5°", () => {
    const row = { plan: "FREE", status: "TRIALING", trialEndsAt: future };
    expect(pauseReason(row, 4, NOW)).toBeNull();
    expect(pauseReason(row, 5, NOW)).toBe("LIMIT_REACHED");
  });
  it("prova finita senza livello o abbonamento concluso: in pausa", () => {
    expect(pauseReason({ plan: "FREE", status: "TRIALING", trialEndsAt: past }, 0, NOW)).toBe("TRIAL_ENDED");
    expect(pauseReason({ plan: "BASE", status: "CANCELED", trialEndsAt: null }, 0, NOW)).toBe("SUBSCRIPTION_ENDED");
    expect(pauseReason(null, 0, NOW)).toBe("TRIAL_ENDED");
  });
  it("Pro non va mai in pausa per il limite; un pagamento non riuscito non mette in pausa", () => {
    expect(pauseReason({ plan: "PRO", status: "ACTIVE", trialEndsAt: null }, 500, NOW)).toBeNull();
    expect(pauseReason({ plan: "PLUS", status: "PAST_DUE", trialEndsAt: null }, 3, NOW)).toBeNull();
  });
});

describe("avviso prima della scadenza", () => {
  const inTwoDays = new Date(NOW.getTime() + 2 * 24 * 60 * 60 * 1000);
  const base = { plan: "BASE", status: "ACTIVE", trialEndsAt: null, currentPeriodEnd: inTwoDays };
  it("rinnovo automatico: avviso una volta sola per scadenza", () => {
    expect(periodNoticeToSend(base, NOW, 3)).toBe("RENEWING");
    expect(periodNoticeToSend({ ...base, noticeFor: inTwoDays }, NOW, 3)).toBeNull();
  });
  it("annullato: avviso di fine invece che di rinnovo", () => {
    expect(periodNoticeToSend({ ...base, cancelAtPeriodEnd: true }, NOW, 3)).toBe("ENDING");
  });
  it("scadenza lontana: nessun avviso", () => {
    expect(periodNoticeToSend({ ...base, currentPeriodEnd: future }, NOW, 3)).toBeNull();
  });
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

describe("prova gratuita dalla data di lancio (docs/CHANGELOG.md §170)", () => {
  const launch = launchDate("2026-11-02")!;

  it("legge la data di lancio come mezzanotte italiana", () => {
    expect(launch.toISOString()).toBe("2026-11-01T23:00:00.000Z");
    expect(launchDate(undefined)).toBeNull();
    expect(launchDate("non una data")).toBeNull();
  });

  it("chi si iscrive prima del lancio ha il mese gratis dal lancio", () => {
    const end = trialEndFor(new Date("2026-10-02T10:00:00Z"), launch);
    expect(end.toISOString()).toBe("2026-12-01T23:00:00.000Z");
  });

  it("chi si iscrive dopo il lancio ha il mese gratis da oggi", () => {
    const now = new Date("2026-11-20T10:00:00Z");
    expect(trialEndFor(now, launch).toISOString()).toBe("2026-12-20T10:00:00.000Z");
    expect(trialEndFor(now, null).toISOString()).toBe("2026-12-20T10:00:00.000Z");
  });

  it("senza data di lancio il sito non risulta lanciato", () => {
    expect(hasLaunched(new Date("2030-01-01T00:00:00Z"), null)).toBe(false);
    expect(hasLaunched(new Date("2026-11-01T22:59:59Z"), launch)).toBe(false);
    expect(hasLaunched(new Date("2026-11-01T23:00:00Z"), launch)).toBe(true);
  });
});
