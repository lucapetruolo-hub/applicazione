import { describe, expect, it } from "vitest";
import { notificationTopicOf } from "@professionisti/shared";
import { renderEmail } from "./email-layout";
import { EMAIL_BRAND } from "./email-brand";
import { NOTIFICATION_EMAIL_TYPES, notificationEmail, type NotificationEmailContext } from "./templates/notification-emails";

/** Modelli email (docs/CHANGELOG.md §185). */
const ctx: NotificationEmailContext = {
  name: "Mario",
  category: "Idraulico",
  city: "Roma",
  businessName: "Idraulica Rossi",
  when: new Date("2026-10-14T09:30:00.000Z"),
  proposedWhen: new Date("2026-10-15T10:00:00.000Z"),
};

describe("modello grafico delle email", () => {
  it("scappa il testo e ammette solo il grassetto", () => {
    const email = renderEmail({ kind: "notification", subject: "Prova", title: "Titolo", paragraphs: ["**ok** <script>alert(1)</script>"] });
    expect(email.html).toContain("<strong>ok</strong>");
    expect(email.html).not.toContain("<script>");
    expect(email.html).toContain("&lt;script&gt;");
    expect(email.text).toContain("ok <script>");
  });

  it("mette nome del marchio, firma e link alle preferenze", () => {
    const email = renderEmail({ kind: "notification", subject: "Prova", greeting: "Anna", title: "Titolo", paragraphs: ["Testo"], cta: { label: "Apri", url: "https://example.it/x" } });
    expect(email.html).toContain(EMAIL_BRAND.name);
    expect(email.html).toContain("Ciao Anna,");
    expect(email.html).toContain('href="https://example.it/x"');
    expect(email.html).toContain("/account/notifiche");
    expect(email.text).toContain("Apri: https://example.it/x");
  });

  it("le email di servizio dicono che arrivano sempre", () => {
    const email = renderEmail({ kind: "account", subject: "Prova", title: "Titolo", paragraphs: ["Testo"] });
    expect(email.html).not.toContain("/account/notifiche");
    expect(email.text).toContain("email di servizio");
  });
});

describe("email delle notifiche", () => {
  it("ogni tipo con email appartiene a un argomento delle preferenze (CLAUDE.md §5 punto 13)", () => {
    for (const type of NOTIFICATION_EMAIL_TYPES) {
      expect(notificationTopicOf(type), type).not.toBeNull();
    }
  });

  it("ogni modello si compone anche con payload e contesto vuoti", () => {
    const empty: NotificationEmailContext = { name: null, category: null, city: null, businessName: null, when: null, proposedWhen: null };
    for (const type of NOTIFICATION_EMAIL_TYPES) {
      for (const context of [ctx, empty]) {
        const content = notificationEmail(type, {}, context);
        expect(content, type).not.toBeNull();
        const email = renderEmail(content!);
        expect(email.subject.trim(), type).not.toBe("");
        expect(email.text, type).not.toMatch(/\bundefined\b|NaN/);
        expect(email.text, type).not.toMatch(/\bnull\b/);
      }
    }
  });

  it("la data dell'appuntamento resta l'ora salvata, senza fuso", () => {
    const content = notificationEmail("QUOTE_DATE_CONFIRMED", {}, ctx)!;
    expect(renderEmail(content).text).toContain("09:30");
  });

  it("la nuova recensione non anticipa mai il voto", () => {
    const content = notificationEmail("NEW_REVIEW", { rating: 2, published: false }, ctx)!;
    const email = renderEmail(content);
    expect(email.text).not.toMatch(/★|2 su 5/);
    expect(email.text).toContain("lascia anche tu la tua recensione");
  });

  it("al professionista non mostra contatti del cliente prima dell'accettazione", () => {
    const content = notificationEmail("NEW_LEAD", { category: "Idraulico", city: "Roma", isUrgent: false }, ctx)!;
    const email = renderEmail(content);
    expect(email.subject).toBe("Nuova richiesta: Idraulico a Roma");
    expect(email.text).not.toMatch(/telefono|indirizzo/i);
  });

  it("se data e orario non cambiano dice che è stata aggiunta solo una nota (docs/CHANGELOG.md §194)", () => {
    for (const type of ["QUOTE_DATE_CHANGED", "QUOTE_DATE_PROPOSED"]) {
      const email = renderEmail(notificationEmail(type, { noteOnly: true }, ctx)!);
      expect(email.subject, type).toContain("nota");
      expect(email.text, type).toContain("senza cambiare data e orario");
      expect(email.text, type).not.toMatch(/modificato|propone|proposto/);
    }
  });

  it("riporta la nota dell'altra parte e avvisa del preventivo aggiornato (docs/CHANGELOG.md §194)", () => {
    const proposed = renderEmail(notificationEmail("QUOTE_DATE_PROPOSED", { noteOnly: true, note: "Citofono rotto, chiamatemi" }, ctx)!);
    expect(proposed.text).toContain('Nota: "Citofono rotto, chiamatemi"');
    expect(proposed.text).toContain("può ancora accettarlo");
    const updated = renderEmail(notificationEmail("QUOTE_UPDATED", { itemsChanged: true, notesChanged: true, note: "Materiali inclusi" }, ctx)!);
    expect(updated.subject).toBe("Idraulica Rossi ha aggiornato il preventivo");
    expect(updated.text).toContain("le voci e le note");
    expect(updated.text).toContain('Nota: "Materiali inclusi"');
    const repriced = renderEmail(notificationEmail("QUOTE_UPDATED", { itemsChanged: true, priceBefore: "100.00 €", priceAfter: "150.00 €" }, ctx)!);
    expect(repriced.text).toContain("passa da 100.00 € a 150.00 €");
  });
});

