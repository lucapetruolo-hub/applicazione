import { describe, expect, it } from "vitest";
import { requestSentEmail } from "./job-emails";

// Una sola email per un invio con più categorie (docs/CHANGELOG.md §253).
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
