import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  colleagueInviteMessage,
  inviteLinkPath,
  isInviteCode,
  isInvitePartnerCode,
  isPersonalLinkCode,
  personalLinkBadgeHtml,
  personalLinkBadgePath,
  personalLinkBadgeSvg,
  personalLinkBadgeTheme,
  personalLinkButtonHtml,
  personalLinkNudgeDue,
} from "./personalLink";
import { inviteCodeSchema } from "./schemas";

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

describe("passaparola (docs/changelog/2026-11-09-passaparola.md)", () => {
  it("codici: 6 caratteri il collega, 7 il partner, mai confusi", () => {
    assert.equal(isInviteCode("k7m2qa"), true);
    assert.equal(isInvitePartnerCode("k7m2qa"), false);
    assert.equal(isInvitePartnerCode("k7m2qab"), true);
    assert.equal(isInviteCode("k7m2qab"), true);
    assert.equal(isInviteCode("../../x"), false);
    assert.equal(inviteLinkPath("k7m2qa"), "/per-professionisti?invito=k7m2qa");
  });

  it("un codice sbagliato si ignora, non blocca l'iscrizione", () => {
    assert.equal(inviteCodeSchema.parse(" K7M2QA "), "k7m2qa");
    assert.equal(inviteCodeSchema.parse("sbagliato!"), undefined);
  });

  it("il messaggio per il collega non promette premi né offerte", () => {
    const text = colleagueInviteMessage({ businessName: "Idraulica Rossi", siteName: "Professionisti", url: "https://x.it/per-professionisti?invito=k7m2qa" });
    assert.ok(text.startsWith("Ciao, sono Idraulica Rossi."));
    assert.ok(text.endsWith("https://x.it/per-professionisti?invito=k7m2qa"));
    assert.doesNotMatch(text, /gratis|premio|sconto|mesi/i);
  });

  it("il bollino: voto e recensioni, o l'invito a chiedere un preventivo; niente script", () => {
    const svg = personalLinkBadgeSvg({ rating: 4.66, reviewCount: 12, siteName: "Professionisti" });
    assert.ok(svg.startsWith("<svg"));
    assert.ok(svg.includes(">4,7<"));
    assert.ok(svg.includes("12 recensioni su Professionisti"));
    assert.doesNotMatch(svg, /<script|on\w+=|href=/i);
    const empty = personalLinkBadgeSvg({ rating: null, reviewCount: 0, siteName: "A&B" });
    assert.ok(empty.includes("Chiedi un preventivo"));
    assert.ok(empty.includes("A&amp;B"));
  });

  it("il bollino scuro per i siti a sfondo scuro", () => {
    assert.equal(personalLinkBadgePath("k7m2qa"), "/p/k7m2qa/bollino.svg");
    assert.equal(personalLinkBadgePath("k7m2qa", "dark"), "/p/k7m2qa/bollino.svg?tema=scuro");
    assert.equal(personalLinkBadgeTheme("scuro"), "dark");
    assert.equal(personalLinkBadgeTheme("<x>"), "light");
    assert.equal(personalLinkBadgeTheme(null), "light");
    const dark = personalLinkBadgeSvg({ rating: 4.2, reviewCount: 3, siteName: "P", theme: "dark" });
    assert.ok(dark.includes('fill="#1F1A17"'));
    assert.ok(!dark.includes('fill="#FFFFFF" stroke'));
    assert.ok(personalLinkBadgeSvg({ rating: 4.2, reviewCount: 3, siteName: "P" }).includes('fill="#FFFFFF" stroke'));
  });

  it("il codice del bollino è un'immagine dentro un link", () => {
    const html = personalLinkBadgeHtml("https://x.it/p/k7m2qa", "https://x.it/p/k7m2qa/bollino.svg", "4,7 su 5");
    assert.ok(html.startsWith('<a href="https://x.it/p/k7m2qa"'));
    assert.ok(html.includes('<img src="https://x.it/p/k7m2qa/bollino.svg" alt="4,7 su 5"'));
    assert.doesNotMatch(html, /<script/i);
  });
});
