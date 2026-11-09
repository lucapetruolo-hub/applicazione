import { describe, expect, it } from "vitest";
import { renderEmail } from "./email-layout";
import { notificationEmail, type NotificationEmailContext } from "./templates/notification-emails";

/**
 * Controllo pre-lancio dell'08/11/2026 (gruppo 6, legale nel codice):
 * conferma del contratto nell'email "Appuntamento prenotato" (E4-04) e
 * misure sull'account con fatti, regola violata e preavviso (E4-03).
 */
const client: NotificationEmailContext = { name: "Giulia", category: "Idraulico", city: "Milano", businessName: "Idraulica Rossi", when: new Date("2026-11-20T09:00:00.000Z"), proposedWhen: null };

function render(type: string, payload: Record<string, unknown>, ctx: NotificationEmailContext = client) {
  return renderEmail(notificationEmail(type, payload, ctx)!);
}

describe("email Appuntamento prenotato come conferma del contratto (E4-04)", () => {
  it("riporta prezzo, pagamento, chi esegue il lavoro, preavviso e recesso", () => {
    const email = render("BOOKING_CONFIRMED", {
      guidedRequestId: "r1",
      price: "da 80,00 € a 120,00 €",
      priceNote: "IVA inclusa",
      payment: "24,00 € adesso con la carta, il resto (da 56,00 € a 96,00 €) a lavoro finito con la stessa carta",
      executor: "Idraulica Rossi Srl · P.IVA 01234567890 · sede a Milano (MI)",
      notice: "24 ore",
    });
    expect(email.text).toContain("da 80,00 € a 120,00 €, IVA inclusa");
    expect(email.text).toContain("a lavoro finito con la stessa carta");
    expect(email.text).toContain("P.IVA 01234567890");
    expect(email.text).toContain("almeno 24 ore prima");
    expect(email.html).toContain("/termini#recesso");
    expect(email.text).toContain("conferma del tuo accordo");
  });

  it("senza prezzo né dati fiscali resta valida", () => {
    const email = render("BOOKING_CONFIRMED", { payment: "Pagamento diretto al professionista", notice: "24 ore" });
    expect(email.text).not.toContain("Prezzo:");
    expect(email.text).toContain("Pagamento diretto al professionista");
  });
});

describe("email delle misure sull'account (E4-03)", () => {
  it("sospensione: fatti, regola violata e come contestare", () => {
    const email = render("ACCOUNT_SUSPENDED", { note: "Saldo non pagato dal 2 novembre", ground: "termini-pagamenti" });
    expect(email.text).toContain("Cosa è successo: Saldo non pagato dal 2 novembre");
    expect(email.text).toContain("Regola violata: Termini di Servizio, punto 5");
    expect(email.text).toContain("Contesta la decisione");
  });

  it("chiusura fissata: data a 30 giorni e l'account funziona fino ad allora", () => {
    const email = render("ACCOUNT_CLOSURE_SCHEDULED", { note: "Due account", ground: "legge-truffa", closureAt: "2026-12-08T10:00:00.000Z" });
    expect(email.subject).toBe("Il tuo account verrà chiuso il 8 dicembre 2026");
    expect(email.text).toContain("Legge violata: Truffa");
    expect(email.text).toContain("Fino ad allora l'account funziona");
  });

  it("annullare la chiusura lo dice per esteso", () => {
    expect(render("ACCOUNT_REACTIVATED", { note: "Chiarito", closureCanceled: true }).text).toContain("La chiusura del tuo account è stata annullata");
  });
});
