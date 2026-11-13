import { describe, expect, it } from "vitest";
import { renderEmail } from "./email-layout";
import { notificationEmail, type NotificationEmailContext } from "./templates/notification-emails";
import { lateCancelDepositNotice } from "../bookings/bookings.service";

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

  it("con l'acconto trattenuto dice fino a quando si annulla gratis e che dopo non è rimborsabile", () => {
    const email = render("BOOKING_CONFIRMED", {
      payment: "24,00 € adesso con la carta",
      notice: "24 ore",
      depositNotice: lateCancelDepositNotice(true, { nowEurCents: 2400, restMaxEurCents: 9600 }, new Date("2026-11-20T08:00:00.000Z"), 24, new Date("2026-11-11T10:00:00.000Z")),
    });
    expect(email.text).toContain("Per annullare: Annullamento gratuito fino a giovedì 19 novembre alle 08:00.");
    expect(email.text).toMatch(/Dopo, l'acconto di 24,00\s€ non è rimborsabile\./);
    expect(email.text).not.toContain("almeno 24 ore prima");
  });

  // Stesse frasi della scheda, per ogni momento (docs/changelog/2026-11-13-annullare-una-fonte.md).
  it("col pagamento diretto solo il preavviso; con l'acconto sempre rimborsabile lo dice; dentro il preavviso e a fascia iniziata non promette niente", () => {
    const start = new Date("2026-11-20T08:00:00.000Z");
    const end = new Date("2026-11-20T13:00:00.000Z");
    const early = new Date("2026-11-11T10:00:00.000Z");
    const split = { nowEurCents: 2400, restMaxEurCents: 9600 };
    const clean = (text: string | null) => text?.replace(/\u00a0/g, " ") ?? null;
    expect(lateCancelDepositNotice(true, null, start, 24, early, end)).toBe("Se devi annullare, avvisa almeno 24 ore prima.");
    expect(clean(lateCancelDepositNotice(false, split, start, 24, early, end))).toBe(
      "Se devi annullare, avvisa almeno 24 ore prima. Se annulli prima dell'appuntamento, l'acconto di 24,00 € ti torna sempre sulla carta.",
    );
    // Dentro il preavviso (20 ore prima): niente più "avvisa almeno 24 ore prima" né "senza costi".
    expect(lateCancelDepositNotice(false, null, start, 24, new Date("2026-11-19T11:00:00.000Z"), end)).toBe(
      "Mancano meno di 24 ore all'appuntamento. Se annulli non paghi niente, ma il professionista vede che hai annullato all'ultimo.",
    );
    // Fascia iniziata: non si può più annullare.
    expect(lateCancelDepositNotice(true, split, start, 24, new Date("2026-11-20T09:00:00.000Z"), end)).toBe("L'appuntamento è già iniziato: non si può più annullare.");
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
