import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { shouldSuggestPlus, type MySubscription } from "./plans";

const base: MySubscription = {
  state: "ACTIVE",
  tier: "BASE",
  pausedReason: null,
  currentPeriodEnd: null,
  cancelAtPeriodEnd: false,
  trialEndsAt: "2027-04-01T00:00:00Z",
  bonusMonthGranted: false,
  freeMonths: { months: 3, currentMonth: 1 },
  freeMonthsWaiting: 0,
  returnToBase: false,
  cardNeeded: false,
  usage: { used: 1, limit: 3, periodStart: "2027-01-01T00:00:00Z", periodEnd: "2027-02-01T00:00:00Z", countsClientsOnce: false, ownClientJobs: 0, requests: 5 },
  limitReached: false,
  limitsActive: true,
  billingInterval: null,
  upgradeQuotes: [{ tier: "PLUS", amountEurCents: 4000, until: null }],
  checkoutAvailable: true,
  fiscalDataNeeded: false,
  identityVerificationNeeded: false,
} as MySubscription;

describe("Plus proposto nei mesi gratis (docs/changelog/2026-11-25-conti-del-mese.md)", () => {
  it("più richieste che lavori Base: sì", () => {
    assert.equal(shouldSuggestPlus(base), true);
  });
  it("fino a 3 richieste: no", () => {
    assert.equal(shouldSuggestPlus({ ...base, usage: { ...base.usage, requests: 3 } }), false);
  });
  it("già al limite (c'è l'altro avviso), in pausa, senza carta, mesi gratis finiti o già su Plus: no", () => {
    assert.equal(shouldSuggestPlus({ ...base, limitReached: true }), false);
    assert.equal(shouldSuggestPlus({ ...base, cardNeeded: true }), false);
    assert.equal(shouldSuggestPlus({ ...base, pausedReason: "CARD_NEEDED" }), false);
    assert.equal(shouldSuggestPlus({ ...base, freeMonths: { months: 3, currentMonth: null } }), false);
    assert.equal(shouldSuggestPlus({ ...base, freeMonths: null }), false);
    assert.equal(shouldSuggestPlus({ ...base, tier: "PLUS" }), false);
    assert.equal(shouldSuggestPlus({ ...base, state: "TRIAL", tier: null }), false);
  });
  it("prima del lancio o senza pagamenti attivi: no", () => {
    assert.equal(shouldSuggestPlus({ ...base, limitsActive: false }), false);
    assert.equal(shouldSuggestPlus({ ...base, checkoutAvailable: false }), false);
    assert.equal(shouldSuggestPlus({ ...base, upgradeQuotes: [] }), false);
  });
});
