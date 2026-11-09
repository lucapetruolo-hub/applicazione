import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isPersonalLinkCode, personalLinkButtonHtml, personalLinkNudgeDue } from "./personalLink";

describe("pulsante per il sito del professionista", () => {
  it("è solo un link al suo indirizzo personale, senza script", () => {
    const html = personalLinkButtonHtml("https://esempio.it/p/k7m2qa");
    assert.ok(html.startsWith('<a href="https://esempio.it/p/k7m2qa" target="_blank" rel="noopener"'));
    assert.ok(html.includes(">Chiedi un preventivo</a>"));
    assert.doesNotMatch(html, /<script|on\w+=/i);
  });

  it("non lascia uscire le virgolette dall'indirizzo", () => {
    assert.ok(personalLinkButtonHtml('https://x.it/p/"><b>').includes('href="https://x.it/p/&quot;&gt;&lt;b&gt;"'));
  });

  it("riconosce solo codici di 6 caratteri dell'alfabeto", () => {
    assert.equal(isPersonalLinkCode("k7m2qa"), true);
    assert.equal(isPersonalLinkCode("k7m2q0"), false);
  });
});

describe('invito dopo "Lavoro terminato"', () => {
  const day = 24 * 60 * 60 * 1000;
  const now = Date.UTC(2026, 10, 9, 12);
  it("la prima volta compare", () => assert.equal(personalLinkNudgeDue(null, now), true));
  it("non torna prima di 30 giorni", () => {
    assert.equal(personalLinkNudgeDue(now - day, now), false);
    assert.equal(personalLinkNudgeDue(now - 29 * day, now), false);
  });
  it("dopo 30 giorni torna", () => assert.equal(personalLinkNudgeDue(now - 30 * day, now), true));
  it("un valore rovinato non lo blocca per sempre", () => {
    assert.equal(personalLinkNudgeDue(Number.NaN, now), true);
    assert.equal(personalLinkNudgeDue(now + 400 * day, now), true);
  });
});
