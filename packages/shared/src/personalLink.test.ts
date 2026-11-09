import { describe, expect, it } from "vitest";
import { isPersonalLinkCode, personalLinkButtonHtml } from "./personalLink";

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
