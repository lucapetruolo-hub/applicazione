import { describe, expect, it } from "vitest";
import { isPersonalLinkCode, personalLinkButtonHtml, personalLinkNudgeDue } from "./personalLink";

describe("pulsante per il sito del professionista", () => {
  it("è solo un link al suo indirizzo personale, senza script", () => {
    const html = personalLinkButtonHtml("https://esempio.it/p/k7m2qa");
    expect(html.startsWith('<a href="https://esempio.it/p/k7m2qa" target="_blank" rel="noopener"')).toBe(true);
    expect(html).toContain(">Chiedi un preventivo</a>");
    expect(html).not.toMatch(/<script|on\w+=/i);
  });

  it("non lascia uscire le virgolette dall'indirizzo", () => {
    expect(personalLinkButtonHtml('https://x.it/p/"><b>')).toContain('href="https://x.it/p/&quot;&gt;&lt;b&gt;"');
  });

  it("riconosce solo codici di 6 caratteri dell'alfabeto", () => {
    expect(isPersonalLinkCode("k7m2qa")).toBe(true);
    expect(isPersonalLinkCode("k7m2q0")).toBe(false);
  });
});

describe("invito dopo \"Lavoro terminato\"", () => {
  const day = 24 * 60 * 60 * 1000;
  const now = Date.UTC(2026, 10, 9, 12);
  it("la prima volta compare", () => expect(personalLinkNudgeDue(null, now)).toBe(true));
  it("non torna prima di 30 giorni", () => {
    expect(personalLinkNudgeDue(now - day, now)).toBe(false);
    expect(personalLinkNudgeDue(now - 29 * day, now)).toBe(false);
  });
  it("dopo 30 giorni torna", () => expect(personalLinkNudgeDue(now - 30 * day, now)).toBe(true));
  it("un valore rovinato non lo blocca per sempre", () => {
    expect(personalLinkNudgeDue(Number.NaN, now)).toBe(true);
    expect(personalLinkNudgeDue(now + 400 * day, now)).toBe(true);
  });
});
