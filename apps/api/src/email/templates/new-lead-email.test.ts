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

  // docs/changelog/2026-11-24-domicilio-online-nelle-notifiche.md
  it("a domicilio: nell'oggetto e nel testo, con la città", () => {
    const email = notificationEmail("NEW_LEAD", { ...base, city: "Marcianise", serviceMode: "HOME", audience: "direct" }, ctx)!;
    expect(email.subject).toBe("Richiesta per te: Idraulico a domicilio a Marcianise");
    const text = email.paragraphs.join("\n");
    expect(text).toContain("**Idraulico** a domicilio a Marcianise");
    expect(text).toContain("**Dove:** a casa del cliente, a Marcianise.");
  });

  it("online: nell'oggetto e nel testo, senza la città", () => {
    const email = notificationEmail("NEW_LEAD", { ...base, serviceMode: "ONLINE", isUrgent: true }, ctx)!;
    expect(email.subject).toBe("URGENTE — Nuova richiesta: Idraulico online");
    const text = email.paragraphs.join("\n");
    expect(text).toContain("**Idraulico** online.");
    expect(text).toContain("**Dove:** online");
    expect(text).not.toContain("Roma");
  });

  it("preventivo accettato: riga Dove", () => {
    const withCtx = { ...ctx, category: "Idraulico", city: "Roma" };
    const online = notificationEmail("QUOTE_ACCEPTED", { serviceMode: "ONLINE" }, withCtx)!;
    expect(online.details).toEqual(expect.arrayContaining([{ label: "Lavoro", value: "Idraulico" }, { label: "Dove", value: "Online" }]));
    expect(online.subject).toBe("Il cliente ha accettato il tuo preventivo · Idraulico online");
    const home = notificationEmail("QUOTE_ACCEPTED", { serviceMode: "HOME" }, withCtx)!;
    expect(home.subject).toBe("Il cliente ha accettato il tuo preventivo · Idraulico a domicilio");
    expect(notificationEmail("QUOTE_ACCEPTED", {}, withCtx)!.subject).toBe("Il cliente ha accettato il tuo preventivo");
    expect(home.details).toEqual(expect.arrayContaining([{ label: "Lavoro", value: "Idraulico, Roma" }, { label: "Dove", value: "A domicilio" }]));
    expect(notificationEmail("QUOTE_ACCEPTED", {}, withCtx)!.details?.some((d) => d.label === "Dove")).toBe(false);
  });

  it("notifiche di prima, senza il dato: testo di sempre", () => {
    const text = body({});
    expect(text).not.toContain("anche ad altri");
    expect(text).toContain("per primo");
  });
});
