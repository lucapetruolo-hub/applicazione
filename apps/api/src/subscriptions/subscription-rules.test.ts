import { describe, expect, it } from "vitest";
import { freeMonthUpgradeEurCents, upgradeFeeEurCents } from "@professionisti/shared";
import {
  addMonthsUtc,
  countsClientsOnce,
  freeMonthsLeftAfterCurrent,
  freeMonthsProgress,
  hasLaunched,
  jobLimitReached,
  launchDate,
  monthlyLimit,
  pauseReason,
  periodNoticeToSend,
  romeMonthKey,
  romeMonthStart,
  subscriptionState,
  tierOfPlan,
  trialEndFor,
  upgradeQuotes,
  usageNoticeToSend,
  usagePeriod,
} from "./subscription-rules";

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
  it("mese gratuito in corso: vale come Base (3 lavori)", () => {
    const row = { plan: "FREE", status: "TRIALING", trialEndsAt: future };
    expect(subscriptionState(row, NOW)).toBe("TRIAL");
    expect(monthlyLimit(row, NOW)).toBe(3);
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
  it("Base attivo: 3 lavori, Plus 10, Pro senza limite", () => {
    expect(monthlyLimit({ plan: "BASE", status: "ACTIVE", trialEndsAt: null }, NOW)).toBe(3);
    expect(monthlyLimit({ plan: "PLUS", status: "ACTIVE", trialEndsAt: null }, NOW)).toBe(10);
    expect(monthlyLimit({ plan: "PRO", status: "ACTIVE", trialEndsAt: null }, NOW)).toBeNull();
  });
});

it("livello scelto durante la prova: vale subito il limite del livello", () => {
  expect(monthlyLimit({ plan: "BASE", status: "ACTIVE", trialEndsAt: future }, NOW)).toBe(3);
  expect(monthlyLimit({ plan: "PLUS", status: "ACTIVE", trialEndsAt: future }, NOW)).toBe(10);
});

describe("account in pausa", () => {
  it("prova finita senza livello o abbonamento concluso: in pausa", () => {
    expect(pauseReason({ plan: "FREE", status: "TRIALING", trialEndsAt: past }, NOW)).toBe("TRIAL_ENDED");
    expect(pauseReason({ plan: "BASE", status: "CANCELED", trialEndsAt: null }, NOW)).toBe("SUBSCRIPTION_ENDED");
    expect(pauseReason(null, NOW)).toBe("TRIAL_ENDED");
  });
  it("mesi gratis senza la carta: in pausa finché non la dà", () => {
    expect(pauseReason({ plan: "FREE", status: "TRIALING", trialEndsAt: future }, NOW)).toBe("CARD_NEEDED");
    expect(pauseReason({ plan: "BASE", status: "ACTIVE", trialEndsAt: future }, NOW)).toBeNull();
  });
  it("i lavori esauriti e un pagamento non riuscito non mettono in pausa", () => {
    expect(pauseReason({ plan: "PLUS", status: "PAST_DUE", trialEndsAt: null }, NOW)).toBeNull();
  });
});

describe("lavori esauriti (§362)", () => {
  it("mese gratis con la carta: libero fino al 3° lavoro, al limite dal 3°", () => {
    const row = { plan: "BASE", status: "ACTIVE", trialEndsAt: future };
    expect(jobLimitReached(row, 2, NOW)).toBe(false);
    expect(jobLimitReached(row, 3, NOW)).toBe(true);
  });
  it("Pro senza limite; in pausa conta la pausa, non il limite", () => {
    expect(jobLimitReached({ plan: "PRO", status: "ACTIVE", trialEndsAt: null }, 500, NOW)).toBe(false);
    expect(jobLimitReached({ plan: "FREE", status: "TRIALING", trialEndsAt: past }, 9, NOW)).toBe(false);
  });
  it("lo stesso cliente conta una volta solo su Plus e Pro", () => {
    expect(countsClientsOnce({ plan: "FREE", status: "TRIALING", trialEndsAt: future }, NOW)).toBe(false);
    expect(countsClientsOnce({ plan: "BASE", status: "ACTIVE", trialEndsAt: null }, NOW)).toBe(false);
    expect(countsClientsOnce({ plan: "PLUS", status: "ACTIVE", trialEndsAt: null }, NOW)).toBe(true);
    expect(countsClientsOnce({ plan: "PRO", status: "PAST_DUE", trialEndsAt: null }, NOW)).toBe(true);
  });
});

describe("periodo dei lavori: riparte al rinnovo (§362)", () => {
  const iso = (p: { start: Date; end: Date }) => [p.start.toISOString(), p.end.toISOString()];
  it("mensile: dal giorno dell'abbonamento al rinnovo", () => {
    const row = {
      plan: "BASE",
      status: "ACTIVE",
      trialEndsAt: null,
      currentPeriodStart: new Date("2026-09-18T08:00:00Z"),
      currentPeriodEnd: new Date("2026-10-18T08:00:00Z"),
    };
    expect(iso(usagePeriod(row, NOW))).toEqual(["2026-09-18T08:00:00.000Z", "2026-10-18T08:00:00.000Z"]);
  });
  it("annuale: un mese alla volta dalla data dell'abbonamento", () => {
    const row = {
      plan: "PLUS",
      status: "ACTIVE",
      trialEndsAt: null,
      currentPeriodStart: new Date("2026-01-31T08:00:00Z"),
      currentPeriodEnd: new Date("2027-01-31T08:00:00Z"),
    };
    expect(iso(usagePeriod(row, new Date("2026-03-05T10:00:00Z")))).toEqual(["2026-02-28T08:00:00.000Z", "2026-03-31T08:00:00.000Z"]);
    expect(iso(usagePeriod(row, NOW))).toEqual(["2026-08-31T08:00:00.000Z", "2026-09-30T08:00:00.000Z"]);
  });
  it("periodo gratuito: blocchi di 30 giorni che finiscono a fine prova", () => {
    const trialEndsAt = new Date("2026-11-20T10:00:00Z");
    const row = { plan: "FREE", status: "TRIALING", trialEndsAt };
    expect(iso(usagePeriod(row, NOW))).toEqual(["2026-09-21T10:00:00.000Z", "2026-10-21T10:00:00.000Z"]);
    expect(iso(usagePeriod(row, new Date("2026-11-01T00:00:00Z")))).toEqual(["2026-10-21T10:00:00.000Z", "2026-11-20T10:00:00.000Z"]);
  });
  it("senza date utili: il mese di calendario", () => {
    expect(usagePeriod({ plan: "BASE", status: "CANCELED", trialEndsAt: null }, NOW).start.toISOString()).toBe("2026-08-31T22:00:00.000Z");
  });
  it("31 gennaio + 1 mese = ultimo di febbraio, come Stripe", () => {
    expect(addMonthsUtc(new Date("2027-01-31T08:00:00Z"), 1).toISOString()).toBe("2027-02-28T08:00:00.000Z");
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

describe("quota di passaggio a un livello superiore (§361)", () => {
  const DAY = 24 * 60 * 60 * 1000;
  const month = 30 * DAY;
  it("10 € + differenza per i giorni rimasti, maggiorata del 10%, senza tetto", () => {
    const fee = (from: "BASE" | "PLUS", to: "PLUS" | "PRO", days: number) => upgradeFeeEurCents({ from, to, interval: "MONTH", remainingMs: days * DAY, periodMs: month });
    expect(fee("BASE", "PLUS", 30)).toBe(5400);
    expect(fee("BASE", "PLUS", 20)).toBe(3933);
    expect(fee("BASE", "PLUS", 7)).toBe(2027);
    expect(fee("BASE", "PLUS", 1)).toBe(1147);
    expect(fee("BASE", "PRO", 7)).toBe(3053);
    expect(fee("PLUS", "PRO", 7)).toBe(2027);
  });
  it("annuale: differenza dei prezzi annui sui giorni dell'anno", () => {
    expect(upgradeFeeEurCents({ from: "BASE", to: "PLUS", interval: "YEAR", remainingMs: 73 * DAY, periodMs: 365 * DAY })).toBe(1000 + Math.round(40000 * 0.2 * 1.1));
  });
  it("stesso livello o inferiore: niente da pagare", () => {
    expect(upgradeFeeEurCents({ from: "PLUS", to: "PLUS", interval: "MONTH", remainingMs: DAY, periodMs: month })).toBe(0);
    expect(upgradeFeeEurCents({ from: "PRO", to: "BASE", interval: "MONTH", remainingMs: DAY, periodMs: month })).toBe(0);
  });

  const base = { interval: "MONTH" as const, waitingLaunch: false, currentPeriodStart: null, currentPeriodEnd: null, now: NOW };
  it("nei mesi gratis, con o senza carta: il mese del livello meno Base, da oggi", () => {
    const trialEndsAt = new Date(NOW.getTime() + 75 * DAY);
    const quotes = [
      { tier: "PLUS", amountEurCents: 4000, until: null },
      { tier: "PRO", amountEurCents: 8000, until: null },
    ];
    expect(upgradeQuotes({ ...base, state: "TRIAL", tier: null, trialEndsAt })).toEqual(quotes);
    expect(upgradeQuotes({ ...base, state: "ACTIVE", tier: "BASE", trialEndsAt })).toEqual(quotes);
  });
  it("prima del lancio non si passa: non c'è limite di lavori", () => {
    expect(upgradeQuotes({ ...base, state: "TRIAL", tier: null, waitingLaunch: true, trialEndsAt: null })).toEqual([]);
  });
  it("abbonamento pagato: periodo di Stripe fino al rinnovo; Pro e prova finita senza quote", () => {
    const start = new Date(NOW.getTime() - 23 * DAY);
    const end = new Date(NOW.getTime() + 7 * DAY);
    expect(upgradeQuotes({ ...base, state: "ACTIVE", tier: "PLUS", trialEndsAt: null, currentPeriodStart: start, currentPeriodEnd: end })).toEqual([
      { tier: "PRO", amountEurCents: 2027, until: end.toISOString() },
    ]);
    expect(upgradeQuotes({ ...base, state: "ACTIVE", tier: "PRO", trialEndsAt: null, currentPeriodStart: start, currentPeriodEnd: end })).toEqual([]);
    expect(upgradeQuotes({ ...base, state: "TRIAL_ENDED", tier: null, trialEndsAt: null })).toEqual([]);
  });
});

describe("mesi gratis dell'offerta (docs/changelog/2026-10-29-offerta-mesi-gratis.md)", () => {
  const DAY = 24 * 60 * 60 * 1000;
  it("mesi dal lancio, o da oggi dopo il lancio", () => {
    const launch = new Date("2026-11-01T23:00:00Z");
    expect(trialEndFor(new Date("2026-10-02T10:00:00Z"), launch, 90).toISOString()).toBe("2027-01-30T23:00:00.000Z");
    expect(trialEndFor(new Date("2026-12-01T10:00:00Z"), launch, 90).toISOString()).toBe("2027-03-01T10:00:00.000Z");
    // Offerta ferma: nessun mese gratis, fino al lancio non si paga comunque.
    expect(trialEndFor(new Date("2026-10-02T10:00:00Z"), launch, 0).toISOString()).toBe(launch.toISOString());
  });
  it("mese gratis in corso per le caselle", () => {
    const end = new Date("2027-01-30T23:00:00Z");
    const at = (days: number) => freeMonthsProgress(3, end, new Date(end.getTime() - 90 * DAY + days * DAY))?.currentMonth;
    expect(at(-1)).toBe(0);
    expect(at(0)).toBe(1);
    expect(at(29.9)).toBe(1);
    expect(at(30)).toBe(2);
    expect(at(65)).toBe(3);
    expect(at(90)).toBeNull();
    expect(freeMonthsProgress(3, null, NOW)).toEqual({ months: 3, currentMonth: 0 });
    expect(freeMonthsProgress(0, end, NOW)).toBeNull();
  });
  it("passando a Plus o Pro il mese iniziato conta come usato, gli altri aspettano", () => {
    const end = new Date(NOW.getTime() + 80 * DAY);
    expect(freeMonthsLeftAfterCurrent(3, end, NOW)).toBe(2);
    expect(freeMonthsLeftAfterCurrent(3, new Date(NOW.getTime() + 20 * DAY), NOW)).toBe(0);
    expect(freeMonthsLeftAfterCurrent(3, new Date(NOW.getTime() + 300 * DAY), NOW)).toBe(3);
    expect(freeMonthsLeftAfterCurrent(3, null, NOW)).toBe(0);
  });
  it("Plus e Pro nei mesi gratis: il prezzo meno il mese Base", () => {
    expect(freeMonthUpgradeEurCents("PLUS")).toBe(4000);
    expect(freeMonthUpgradeEurCents("PRO")).toBe(8000);
    expect(freeMonthUpgradeEurCents("BASE")).toBe(0);
  });
  it("con tre mesi davanti il periodo dei lavori è il mese gratis in corso", () => {
    const trialEndsAt = new Date(NOW.getTime() + 75 * DAY);
    const period = usagePeriod({ plan: "FREE", status: "TRIALING", trialEndsAt, freeMonthsGranted: 3 }, NOW);
    expect(period.start.toISOString()).toBe(new Date(trialEndsAt.getTime() - 90 * DAY).toISOString());
    expect(period.end.toISOString()).toBe(new Date(trialEndsAt.getTime() - 60 * DAY).toISOString());
  });
});
