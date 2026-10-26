import { describe, expect, it } from "vitest";
import { requestSentEmail } from "./job-emails";

// Una sola email per un invio con più categorie (docs/CHANGELOG.md §259).
describe("requestSentEmail", () => {
  const base = { name: "Anna", city: "Roma", isUrgent: false, sentTo: 4, direct: false };

  it("una categoria: testo al singolare", () => {
    const email = requestSentEmail({ ...base, category: "Idraulico" });
    expect(email.subject).toBe("Richiesta inviata: Idraulico a Roma");
  });

  it("più categorie: un'unica email al plurale", () => {
    const email = requestSentEmail({ ...base, category: "Idraulico ed Elettricista", requestsCount: 2 });
    expect(email.subject).toBe("Richieste inviate: Idraulico ed Elettricista a Roma");
    expect(email.text).toContain("le tue 2 richieste");
  });
});

// Riepilogo di quello che il cliente ha inviato e "Modifica richiesta" (docs/CHANGELOG.md §355).
describe("requestSentEmail: riepilogo", () => {
  const base = { name: "Anna", category: "Idraulico", city: "Roma", isUrgent: false, sentTo: 4, direct: false };
  const summary = {
    timing: "WEEK" as const,
    serviceMode: "HOME" as const,
    address: "Via Appia",
    houseNumber: "12",
    addressExtra: "scala B",
    postalCode: "00179",
    province: "RM",
    photoUrls: ["https://res.cloudinary.com/demo/image/upload/v1/richieste/lavandino.jpg", "https://res.cloudinary.com/demo/video/upload/v1/richieste/perdita.mp4"],
  };

  it("mostra servizio, quando, indirizzo, descrizione intera e foto", () => {
    const description = `Perde il rubinetto della cucina.\n${"a".repeat(300)}`;
    const email = requestSentEmail({ ...base, requestId: "req-1", description, summary });
    expect(email.text).toContain("Servizio: Idraulico");
    expect(email.text).toContain("Quando: In settimana");
    expect(email.text).toContain("Indirizzo: Via Appia 12, scala B, 00179 Roma (RM)");
    expect(email.text).toContain(description);
    expect(email.text).toContain("Foto (2): 2");
    expect(email.html).toContain("/image/upload/c_fill,w_176,h_176,q_auto/v1/richieste/lavandino.jpg");
    expect(email.html).toContain("/video/upload/c_fill,w_176,h_176,q_auto,so_0/v1/richieste/perdita.jpg");
  });

  it("il pulsante apre la modifica della richiesta", () => {
    const email = requestSentEmail({ ...base, requestId: "req-1", summary });
    expect(email.text).toContain("Modifica richiesta: http://localhost:3000/le-mie-richieste?open=req-1&modifica=1");
    expect(email.text).toContain("Segui la richiesta: http://localhost:3000/le-mie-richieste?open=req-1");
  });

  it("niente nome e telefono di chi riceve il professionista, niente pagamento", () => {
    const email = requestSentEmail({ ...base, requestId: "req-1", summary });
    expect(email.text).not.toMatch(/telefono:|pagamento|acconto/i);
  });

  it("online, urgente e richiesta dall'agenda", () => {
    expect(requestSentEmail({ ...base, city: null, summary: { serviceMode: "ONLINE", timing: "TODAY" } }).text).toContain("Dove: Online");
    expect(requestSentEmail({ ...base, isUrgent: true, summary: { timing: "TODAY" } }).text).toContain("Quando: Oggi, urgente");
    const fromAgenda = requestSentEmail({ ...base, direct: true, summary: { preferredDate: new Date("2026-11-03T00:00:00.000Z"), preferredTimeSlot: "09:00-11:00", businessName: "Idraulica Rossi" } });
    expect(fromAgenda.text).toContain("Quando: martedì 3 novembre, 09:00–11:00");
    expect(fromAgenda.text).toContain("Inviata a: Idraulica Rossi");
  });

  it("più categorie: nessun pulsante di modifica unico", () => {
    const email = requestSentEmail({ ...base, category: "Idraulico ed Elettricista", requestsCount: 2, summary });
    expect(email.text).toContain("Servizi: Idraulico ed Elettricista");
    expect(email.text).toContain("Controlla le richieste: http://localhost:3000/le-mie-richieste");
    expect(email.text).not.toContain("modifica=1");
  });
});
