import { test } from "node:test";
import assert from "node:assert/strict";
import { TERMS_CHANGES, TERMS_NOTICE_DAYS, termsChangeToAnnounce, type TermsChange } from "./termsChanges";

const DAY = 24 * 60 * 60 * 1000;

test("versioni dei Termini: uniche, in ordine e con il preavviso", () => {
  const versions = TERMS_CHANGES.map((change) => change.version);
  assert.equal(new Set(versions).size, versions.length);
  for (let i = 1; i < TERMS_CHANGES.length; i++) assert.ok(TERMS_CHANGES[i]!.publishedAt > TERMS_CHANGES[i - 1]!.publishedAt);
  for (const change of TERMS_CHANGES) {
    assert.equal(change.version, change.publishedAt);
    assert.ok(change.summary.length > 0);
    if (!change.notify) continue;
    const gap = (Date.parse(change.effectiveAt) - Date.parse(change.publishedAt)) / DAY;
    assert.ok(gap >= TERMS_NOTICE_DAYS, `${change.version}: preavviso di ${gap} giorni`);
  }
});

test("si annuncia l'ultima versione già pubblicata", () => {
  const changes: TermsChange[] = [
    { version: "2026-10-30", publishedAt: "2026-10-30", effectiveAt: "2026-10-30", summary: ["a"], notify: false },
    { version: "2027-01-10", publishedAt: "2027-01-10", effectiveAt: "2027-01-25", summary: ["b"], notify: true },
    { version: "2027-03-01", publishedAt: "2027-03-01", effectiveAt: "2027-03-16", summary: ["c"], notify: true },
  ];
  assert.equal(termsChangeToAnnounce("2026-12-01", changes), null);
  assert.equal(termsChangeToAnnounce("2027-01-10", changes)?.version, "2027-01-10");
  assert.equal(termsChangeToAnnounce("2027-03-05", changes)?.version, "2027-03-01");
});
