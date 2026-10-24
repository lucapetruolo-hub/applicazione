import { describe, expect, it } from "vitest";
import { notificationTopicOf } from "@professionisti/shared";
import { renderEmail } from "./email-layout";
import { notificationEmail, type NotificationEmailContext } from "./templates/notification-emails";

/**
 * Email delle segnalazioni secondo il DSA (docs/CHANGELOG.md §318): chi
 * segnala riceve solo presa in carico ed esito in una riga, mai la
 * motivazione né il nome dell'autore; chi è colpito riceve misura, regola o
 * legge violata, motivazione e come contestare.
 */
const ctx: NotificationEmailContext = { name: "Anna", category: null, city: null, businessName: null, when: null, proposedWhen: null };

function render(type: string, payload: Record<string, unknown>) {
  return renderEmail(notificationEmail(type, payload, ctx)!);
}

describe("email delle segnalazioni", () => {
  it("presa in carico: nessun link e nessun esito", () => {
    const email = render("CONTENT_REPORT_RECEIVED", { targetType: "REVIEW" });
    expect(email.subject).toBe("Abbiamo preso in carico la tua segnalazione");
    expect(email.text).toContain("recensione del cliente");
    expect(email.html).not.toContain("/segnalazioni");
  });

  it("esito a chi segnala: una riga, il ricorso al giudice, mai la motivazione", () => {
    const upheld = render("CONTENT_REPORT_DECISION", { targetType: "REVIEW", status: "RESOLVED", note: "Testo riservato dell'admin" });
    expect(upheld.text).toContain("preso provvedimenti sul contenuto");
    expect(upheld.text).toContain("autorità giudiziaria");
    expect(upheld.text).not.toContain("Testo riservato");
    expect(upheld.html).not.toContain("/segnalazioni");
    const dismissed = render("CONTENT_REPORT_DECISION", { targetType: "REVIEW", status: "DISMISSED" });
    expect(dismissed.text).toContain("non abbiamo preso provvedimenti");
  });

  it("decisione all'autore: misura, legge violata, motivazione e contestazione", () => {
    const email = render("CONTENT_REPORT_UPHELD", { targetType: "REVIEW", action: "HIDE_CONTENT", ground: "legge-diffamazione", note: "Accusa di furto senza riscontri." });
    expect(email.text).toContain("La tua recensione è stata nascosta");
    expect(email.text).toContain("Legge violata: Diffamazione (art. 595 del codice penale)");
    expect(email.text).toContain("Motivazione: Accusa di furto senza riscontri.");
    expect(email.text).toContain("non da un sistema automatico");
    expect(email.text).toContain("Contesta la decisione");
    expect(email.text).toContain("/segnalazioni");
  });

  it("decisione all'autore per una regola dei Termini", () => {
    const email = render("CONTENT_REPORT_UPHELD", { targetType: "REVIEW", action: "WARN", ground: "termini-contenuti", note: "Pubblicità." });
    expect(email.text).toContain("Regola violata: Termini di Servizio, punto 7");
  });

  it("sono email di servizio, non si possono spegnere", () => {
    expect(notificationTopicOf("CONTENT_REPORT_RECEIVED")).toBe("account");
    expect(notificationTopicOf("CONTENT_REPORT_DECISION")).toBe("account");
    expect(notificationTopicOf("CONTENT_REPORT_UPHELD")).toBe("account");
  });
});
