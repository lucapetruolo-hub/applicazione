import { describe, expect, it } from "vitest";
import { notificationEmail, type NotificationEmailContext } from "./notification-emails";

// Solo per te, scelto tra pochi o a più professionisti
// (docs/changelog/2026-11-10-richiesta-solo-per-te.md).
describe("email Nuova richiesta", () => {
  const ctx: NotificationEmailContext = { name: "Marco", category: null, city: null, businessName: null, when: null, proposedWhen: null };
  const base = { category: "Idraulico", city: "Roma", isUrgent: false };
  const body = (payload: Record<string, unknown>) => notificationEmail("NEW_LEAD", { ...base, ...payload }, ctx)!.paragraphs.join("\n");

  it("diretta: lo dice l'oggetto e non parla di gara", () => {
    const email = notificationEmail("NEW_LEAD", { ...base, audience: "direct" }, ctx)!;
    expect(email.subject).toBe("Richiesta per te: Idraulico a Roma");
    expect(body({ audience: "direct" })).toContain("**solo a te**");
    expect(body({ audience: "direct" })).not.toContain("per primo");
  });

  it("diretta con inoltro: dice entro quando, poi va anche ad altri", () => {
    const forwardAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    expect(body({ audience: "direct", forwardAt })).toMatch(/\*\*Se non rispondi entro (le|domani alle) \d\d:\d\d\*\* la richiesta va anche ad altri/);
    // Già passata (email trattenuta di notte): la frase non c'è.
    expect(body({ audience: "direct", forwardAt: new Date(Date.now() - 60_000).toISOString() })).not.toContain("Se non rispondi");
    expect(body({ audience: "direct", forwardAt: null })).not.toContain("Se non rispondi");
  });

  it("diretta urgente", () => {
    const email = notificationEmail("NEW_LEAD", { ...base, isUrgent: true, audience: "direct" }, ctx)!;
    expect(email.subject).toBe("URGENTE — Richiesta per te: Idraulico a Roma");
    expect(email.title).toBe("Richiesta urgente per te");
  });

  it("scelto tra pochi: quanti sono, mai chi", () => {
    expect(body({ audience: "chosen", among: 2 })).toContain("**te e un altro professionista**");
    expect(body({ audience: "chosen", among: 4 })).toContain("**te e altri 3 professionisti**");
    expect(notificationEmail("NEW_LEAD", { ...base, audience: "chosen", among: 3 }, ctx)!.subject).toBe("Nuova richiesta: Idraulico a Roma");
  });

  it("a più professionisti: una riga in più", () => {
    expect(body({ audience: "shared" })).toContain("anche ad altri professionisti della zona");
  });

  it("notifiche di prima, senza il dato: testo di sempre", () => {
    const text = body({});
    expect(text).not.toContain("anche ad altri");
    expect(text).toContain("per primo");
  });
});
