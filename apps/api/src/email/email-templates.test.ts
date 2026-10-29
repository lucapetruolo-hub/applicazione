import { describe, expect, it } from "vitest";
import { notificationTopicOf } from "@professionisti/shared";
import { renderEmail } from "./email-layout";
import { EMAIL_BRAND } from "./email-brand";
import { bookingReminderClientEmail, bookingReminderProfessionalEmail } from "./templates/job-emails";
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

  it("lavoro terminato: riporta il motivo dell'importo diverso dal preventivo (docs/CHANGELOG.md §228)", () => {
    const withReason = renderEmail(notificationEmail("JOB_COMPLETED", { finalAmountEurCents: 8000, changeReason: "Raccordo da sostituire" }, ctx)!);
    expect(withReason.text).toContain("Diverso dal preventivo perché");
    expect(withReason.text).toContain("Raccordo da sostituire");
    const without = renderEmail(notificationEmail("JOB_COMPLETED", { finalAmountEurCents: 8000 }, ctx)!);
    expect(without.text).not.toContain("Diverso dal preventivo");
  });

  it("preventivo accettato: dati del cliente e fascia dell'appuntamento nell'email (docs/CHANGELOG.md §228)", () => {
    const email = renderEmail(
      notificationEmail(
        "QUOTE_ACCEPTED",
        { clientName: "Mario Bianchi", clientPhone: "333 1234567", clientAddress: "Via Roma 1 — 20100 Milano (MI)", scheduledEndAt: "2026-10-14T13:00:00.000Z" },
        ctx,
      )!,
    );
    expect(email.text).toContain("Mario Bianchi");
    expect(email.text).toContain("333 1234567");
    expect(email.text).toContain("Via Roma 1");
    expect(email.text).toContain("09:30–13:00");
  });

  it("modifiche dell'appuntamento: descrizione, prima e nuova proposta (docs/CHANGELOG.md §228)", () => {
    const withDescription = { ...ctx, description: "Perdita sotto il lavello" };
    const slots = {
      change: "both",
      from: { start: "2026-10-14T09:30:00.000Z", end: "2026-10-14T11:00:00.000Z" },
      to: { start: "2026-10-16T15:00:00.000Z", end: "2026-10-16T17:00:00.000Z" },
    };
    for (const type of ["QUOTE_DATE_PROPOSED", "QUOTE_DATE_CHANGED", "QUOTE_DATE_REJECTED"]) {
      const text = renderEmail(notificationEmail(type, slots, withDescription)!).text;
      expect(text).toContain("Perdita sotto il lavello");
      expect(text).toContain("09:30–11:00");
      expect(text).toContain("15:00–17:00");
    }
  });

  it("modifiche della sola nota: nota di prima, nota nuova e appuntamento invariato (docs/CHANGELOG.md §228)", () => {
    const payload = { noteOnly: true, previousNote: "Suonare al citofono", note: "Citofono rotto, chiamatemi", to: { start: "2026-10-14T09:30:00.000Z", end: "2026-10-14T11:00:00.000Z" } };
    for (const type of ["QUOTE_DATE_CHANGED", "QUOTE_DATE_PROPOSED"]) {
      const text = renderEmail(notificationEmail(type, payload, ctx)!).text;
      expect(text, type).toContain('Nota di prima: "Suonare al citofono"');
      expect(text, type).toContain('Nota nuova: "Citofono rotto, chiamatemi"');
      expect(text, type).toContain("Appuntamento (invariato): ");
      expect(text, type).toContain("09:30–11:00");
    }
    const updated = renderEmail(notificationEmail("QUOTE_UPDATED", { notesChanged: true, previousNote: "Materiali esclusi", note: "Materiali inclusi" }, ctx)!).text;
    expect(updated).toContain('Note di prima: "Materiali esclusi"');
    expect(updated).toContain('Note nuove: "Materiali inclusi"');
  });

  it("ogni email di una richiesta riporta la descrizione dell'intervento (docs/CHANGELOG.md §228)", () => {
    const withDescription = { ...ctx, description: "Perdita sotto il lavello" };
    for (const type of NOTIFICATION_EMAIL_TYPES) {
      const content = notificationEmail(type, {}, withDescription);
      if (content) expect(renderEmail(content).text).toContain("Descrizione: Perdita sotto il lavello");
    }
    expect(renderEmail(notificationEmail("NEW_REVIEW", {}, ctx)!).text).not.toContain("Descrizione");
  });

  it("la nuova recensione non anticipa mai il voto", () => {
    const content = notificationEmail("NEW_REVIEW", { rating: 2 }, ctx)!;
    const email = renderEmail(content);
    expect(email.text).not.toMatch(/★|2 su 5/);
    expect(email.text).toContain("già visibile sul tuo profilo");
    expect(email.text).not.toMatch(/recensisci il cliente/i);
  });

  it("nuova richiesta: scadenza in ora italiana, mai per le urgenti (docs/CHANGELOG.md §224)", () => {
    const respondUntil = "2026-12-11T15:36:00.000Z";
    const normal = renderEmail(notificationEmail("NEW_LEAD", { category: "Idraulico", city: "Roma", isUrgent: false, respondUntil }, ctx)!);
    expect(normal.text).toContain("Puoi rispondere fino all'11 dicembre alle 16:36");
    const urgent = renderEmail(notificationEmail("NEW_LEAD", { category: "Idraulico", city: "Roma", isUrgent: true, respondUntil }, ctx)!);
    expect(urgent.text).not.toContain("Puoi rispondere fino");
  });

  it("al professionista non mostra contatti del cliente prima dell'accettazione", () => {
    const content = notificationEmail("NEW_LEAD", { category: "Idraulico", city: "Roma", isUrgent: false }, ctx)!;
    const email = renderEmail(content);
    expect(email.subject).toBe("Nuova richiesta: Idraulico a Roma");
    expect(email.text).not.toMatch(/telefono|indirizzo/i);
  });

  it("se data e orario non cambiano dice che è stata aggiunta solo una nota (docs/CHANGELOG.md §196)", () => {
    for (const type of ["QUOTE_DATE_CHANGED", "QUOTE_DATE_PROPOSED"]) {
      const email = renderEmail(notificationEmail(type, { noteOnly: true }, ctx)!);
      expect(email.subject, type).toContain("nota");
      expect(email.text, type).toContain("senza cambiare data e orario");
      expect(email.text, type).not.toMatch(/modificato|propone|proposto/);
    }
  });

  it("riporta la nota dell'altra parte e avvisa del preventivo aggiornato (docs/CHANGELOG.md §196)", () => {
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


describe("promemoria del giorno prima (docs/CHANGELOG.md §234)", () => {
  const scheduledAt = new Date("2026-10-15T09:00:00.000Z");
  const scheduledEndAt = new Date("2026-10-15T11:00:00.000Z");

  it("al professionista: luogo e tutti i contatti del cliente", () => {
    const email = bookingReminderProfessionalEmail({
      name: "Luigi",
      clientName: "Anna Bianchi",
      clientPhone: "+39 333 1234567",
      clientEmail: "anna@example.it",
      address: "Via Roma 10 — 00100 Roma (RM)",
      scheduledAt,
      scheduledEndAt,
      category: "Idraulico",
      city: "Roma",
      description: "Perdita sotto il lavandino",
    });
    for (const value of ["Anna Bianchi", "+39 333 1234567", "anna@example.it", "Via Roma 10 — 00100 Roma (RM)", "Idraulico", "Perdita sotto il lavandino", "09:00–11:00"]) {
      expect(email.text).toContain(value);
    }
    expect(email.html).toContain('href="tel:+393331234567"');
    expect(email.html).toContain('href="mailto:anna@example.it"');
    expect(email.html).toContain("https://www.google.com/maps/search/?api=1&amp;query=Via%20Roma%2010");
  });

  it("al cliente: nome e cognome di chi viene, data, ora, lavoro e descrizione", () => {
    const email = bookingReminderClientEmail({
      name: "Anna",
      businessName: "Idraulica Rossi",
      professionalFullName: "Luigi Rossi",
      address: "Via Roma 10 — 00100 Roma (RM)",
      scheduledAt,
      scheduledEndAt,
      category: "Idraulico",
      description: "Perdita sotto il lavandino",
      calendarUrl: "https://calendar.google.com/calendar/render?action=TEMPLATE",
    });
    expect(email.html).toContain("Aggiungi a Google Calendar");
    expect(email.html).toContain('href="https://calendar.google.com/calendar/render?action=TEMPLATE"');
    for (const value of ["Luigi Rossi (Idraulica Rossi)", "Via Roma 10 — 00100 Roma (RM)", "giovedì 15 ottobre", "09:00–11:00", "Idraulico", "Perdita sotto il lavandino"]) {
      expect(email.text).toContain(value);
    }
  });

  it("al cliente: pulsanti Ci sarò e Non posso più, e con l'acconto la scadenza per annullare", () => {
    const email = bookingReminderClientEmail({
      name: "Anna",
      businessName: "Idraulica Rossi",
      professionalFullName: null,
      scheduledAt,
      category: null,
      replyUrl: "https://sito.it/promemoria/abc.def",
      depositDeadline: new Date("2026-10-14T09:00:00.000Z"),
      deposit: true,
    });
    expect(email.subject).toBe("Promemoria: giovedì 15 ottobre alle 09:00 l'appuntamento con Idraulica Rossi");
    expect(email.html).toContain('href="https://sito.it/promemoria/abc.def?risposta=ci-saro"');
    expect(email.html).toContain('href="https://sito.it/promemoria/abc.def?risposta=non-posso"');
    expect(email.text).toContain("entro mercoledì 14 ottobre alle 09:00: così l'acconto ti torna indietro");
    // Senza link resta il pulsante della richiesta.
    const plain = bookingReminderClientEmail({ name: null, businessName: "Idraulica Rossi", professionalFullName: null, scheduledAt, category: null });
    expect(plain.subject).toBe("Promemoria: domani l'appuntamento con Idraulica Rossi");
    expect(plain.text).toContain("Apri la richiesta");
    expect(plain.text).not.toContain("Ci sarò");
  });

  it("avviso delle ricerche senza professionisti vicino: una riga per zona (§371)", () => {
    const email = renderEmail(
      notificationEmail("ADMIN_SEARCH_DEMAND_ALERT", { zones: [{ categoryLabel: "Fabbro", city: "Aprilia", searches: 7, empty: 6 }, { categoryLabel: "Idraulico", city: "Sezze", searches: 1, empty: 1 }] }, ctx)!,
    );
    expect(email.text).toContain("Fabbro, Aprilia: 6 ricerche");
    expect(email.text).toContain("Idraulico, Sezze: 1 ricerca");
    expect(email.text).toContain("/admin/numeri-professionisti");
  });

  it("consigli della settimana: cosa fare, una riga per consiglio (§372)", () => {
    const email = renderEmail(
      notificationEmail(
        "ADMIN_WEEKLY_ADVICE",
        {
          advice: [
            { level: "URGENT", title: "Idraulico a Latina: servono più professionisti", todo: "Cerca professionisti a Latina." },
            { level: "TIP", title: "Cercano «antennista», un lavoro che non c'è", todo: "Valuta se aggiungerlo." },
          ],
        },
        ctx,
      )!,
    );
    expect(email.subject).toBe("2 cose da fare questa settimana");
    expect(email.text).toContain("Fallo subito · Idraulico a Latina: servono più professionisti. Cerca professionisti a Latina.");
    expect(email.text).toContain("Quando hai tempo · Cercano «antennista»");
    expect(email.text).toContain("/admin/andamento");
  });
});

