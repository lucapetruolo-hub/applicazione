import { describe, expect, it } from "vitest";
import { adviseSuspiciousUser, hasNewSignals, isDisposableEmail, messageHasContacts, signalKey, sortSuspiciousUsers } from "@professionisti/shared";
import { buildUserSignals, normalizeAddress, normalizeIban, normalizePhone, type SignalInput } from "./user-signals";

/** Segnali da controllare (docs/changelog/2026-10-30-admin-persone.md). */
const base: SignalInput = {
  people: [
    { id: "a", label: "Anna Neri", role: "CLIENT" },
    { id: "b", label: "Bruno Neri", role: "CLIENT" },
    { id: "c", label: "Carla Blu", role: "CLIENT" },
    { id: "p", label: "Idraulica Rossi", role: "PROFESSIONAL" },
    { id: "q", label: "Rossi Impianti", role: "PROFESSIONAL" },
  ],
  phones: [],
  addresses: [],
  taxIds: [],
  reviews: [],
  completions: [],
  fullDeposits: [],
};
const day = (d: number, h = 0) => new Date(Date.UTC(2026, 9, d, h));

describe("segnali da controllare", () => {
  it("stesso telefono scritto in modi diversi: segnale su tutti e due, con l'altro da aprire", () => {
    const phones = [
      { userId: "a", value: normalizePhone("+39 333 123 4567")! },
      { userId: "b", value: normalizePhone("3331234567")! },
      { userId: "c", value: normalizePhone("3339999999")! },
    ];
    const signals = buildUserSignals({ ...base, phones });
    expect(signals.get("a")).toEqual([{ kind: "SAME_PHONE", detail: "anche Bruno Neri", others: [{ id: "b", label: "Bruno Neri", role: "CLIENT" }] }]);
    expect(signals.get("b")?.[0]?.others[0]?.id).toBe("a");
    expect(signals.has("c")).toBe(false);
  });

  it("lo stesso valore usato due volte dalla stessa persona non è un segnale", () => {
    const signals = buildUserSignals({ ...base, phones: [{ userId: "a", value: "3331234567" }, { userId: "a", value: "3331234567" }] });
    expect(signals.size).toBe(0);
  });

  it("indirizzo uguale anche con maiuscole e punteggiatura, mai senza civico", () => {
    expect(normalizeAddress("Via Roma", "10", "Latina")).toBe(normalizeAddress("via  roma,", "10", "LATINA"));
    expect(normalizeAddress("Via Roma", null, "Latina")).toBeNull();
  });

  it("recensione entro 48 ore dall'iscrizione, lavoro chiuso prima dell'appuntamento, acconto del 100% da un nuovo", () => {
    const signals = buildUserSignals({
      ...base,
      reviews: [
        { clientId: "a", clientCreatedAt: day(1), createdAt: day(2), proUserId: "p", professionalLabel: "Idraulica Rossi" },
        { clientId: "c", clientCreatedAt: day(1), createdAt: day(10), proUserId: "p", professionalLabel: "Idraulica Rossi" },
      ],
      completions: [{ proUserId: "p", clientLabel: "Anna Neri", scheduledAt: day(5, 10), completedAt: day(4) }],
      fullDeposits: [{ proUserId: "p", proCreatedAt: day(1), createdAt: day(3), clientLabel: "Carla Blu" }],
    });
    expect(signals.get("a")?.map((s) => s.kind)).toEqual(["QUICK_REVIEW"]);
    expect(signals.has("c")).toBe(false);
    expect(signals.get("p")?.map((s) => s.kind)).toEqual(["CLOSED_BEFORE_APPOINTMENT", "FULL_DEPOSIT_NEW_PRO"]);
  });

  it("chi non è tra le persone controllate (chiusi, di prova) resta fuori", () => {
    const signals = buildUserSignals({ ...base, phones: [{ userId: "a", value: "1" }, { userId: "zz", value: "1" }] });
    expect(signals.size).toBe(0);
  });

  it("recensione tra due account con lo stesso telefono: segnale su chi scrive e su chi riceve, anche se non è veloce", () => {
    const signals = buildUserSignals({
      ...base,
      phones: [
        { userId: "c", value: "3331234567" },
        { userId: "p", value: "3331234567" },
      ],
      reviews: [{ clientId: "c", clientCreatedAt: day(1), createdAt: day(20), proUserId: "p", professionalLabel: "Idraulica Rossi" }],
    });
    expect(signals.get("c")?.map((s) => s.kind)).toEqual(["SAME_PHONE", "REVIEW_SAME_PERSON"]);
    expect(signals.get("p")?.map((s) => s.kind)).toEqual(["SAME_PHONE", "REVIEW_SAME_PERSON"]);
    expect(adviseSuspiciousUser("CLIENT", signals.get("c")!)).toMatchObject({ level: "ALTA", tab: "recensioni" });
    expect(adviseSuspiciousUser("CLIENT", signals.get("c")!).text).toContain("Nascondi la sua recensione a Idraulica Rossi");
    expect(adviseSuspiciousUser("PROFESSIONAL", signals.get("p")!)).toMatchObject({ level: "ALTA", tab: "recensioni" });
  });
});

describe("cosa fare per ogni account sospetto", () => {
  it("stessa famiglia (due clienti, stesso telefono) o recensione veloce da sola: nessuna azione", () => {
    const signals = buildUserSignals({
      ...base,
      phones: [
        { userId: "a", value: "3331234567" },
        { userId: "b", value: "3331234567" },
      ],
      reviews: [{ clientId: "a", clientCreatedAt: day(1), createdAt: day(2), proUserId: "p", professionalLabel: "Idraulica Rossi" }],
    });
    expect(adviseSuspiciousUser("CLIENT", signals.get("a")!).level).toBe("BASSA");
    expect(adviseSuspiciousUser("CLIENT", signals.get("b")!).text).toContain("stessa famiglia");
  });

  it("due professionisti con la stessa partita IVA: da fare subito; stesso telefono: da guardare", () => {
    const tax = buildUserSignals({ ...base, taxIds: [{ userId: "p", value: "01234567890" }, { userId: "q", value: "01234567890" }] });
    expect(adviseSuspiciousUser("PROFESSIONAL", tax.get("p")!)).toMatchObject({ level: "ALTA", tab: "riepilogo" });
    const phone = buildUserSignals({ ...base, phones: [{ userId: "p", value: "3331234567" }, { userId: "q", value: "3331234567" }] });
    expect(adviseSuspiciousUser("PROFESSIONAL", phone.get("p")!).level).toBe("MEDIA");
  });

  it("vince il consiglio più urgente, e l'elenco mette prima i casi da fare subito", () => {
    const signals = buildUserSignals({
      ...base,
      completions: [{ proUserId: "p", clientLabel: "Anna Neri", scheduledAt: day(5, 10), completedAt: day(4) }],
      taxIds: [{ userId: "p", value: "01234567890" }, { userId: "q", value: "01234567890" }],
    });
    expect(adviseSuspiciousUser("PROFESSIONAL", signals.get("p")!).level).toBe("ALTA");
    const sorted = sortSuspiciousUsers([
      { label: "Bassa", signals: [1, 2, 3], advice: { level: "BASSA" as const, text: "", tab: "riepilogo" as const } },
      { label: "Alta", signals: [1], advice: { level: "ALTA" as const, text: "", tab: "riepilogo" as const } },
      { label: "Media", signals: [1], advice: { level: "MEDIA" as const, text: "", tab: "lavori" as const } },
    ]);
    expect(sorted.map((u) => u.label)).toEqual(["Alta", "Media", "Bassa"]);
  });
});

describe("controlli in più (02/11/2026)", () => {
  it("stesso IBAN tra due professionisti: Da fare subito, anche scritto con gli spazi", () => {
    const ibans = [
      { userId: "p", value: normalizeIban("IT60 X054 2811 1010 0000 0123 456")! },
      { userId: "q", value: normalizeIban("it60x0542811101000000123456")! },
    ];
    const signals = buildUserSignals({ ...base, ibans });
    expect(signals.get("p")?.map((s) => s.kind)).toEqual(["SAME_IBAN"]);
    expect(adviseSuspiciousUser("PROFESSIONAL", signals.get("p")!)).toMatchObject({ level: "ALTA" });
  });

  it("contatti in chat: numeri di 9 cifre, email, link e WhatsApp sì; date, orari e prezzi no", () => {
    expect(messageHasContacts("chiamami al 333 123 4567")).toBe(true);
    expect(messageHasContacts("scrivimi a mario.rossi@gmail.com")).toBe(true);
    expect(messageHasContacts("guarda www.mioSito.it")).toBe(true);
    expect(messageHasContacts("ci sentiamo su WhatsApp")).toBe(true);
    expect(messageHasContacts("+39 333-123-4567")).toBe(true);
    expect(messageHasContacts("passo il 12.11.2026 alle 9, costo 1.250 euro")).toBe(false);
    expect(messageHasContacts("vengo il 12.11.2026 10.30")).toBe(false);
    expect(messageHasContacts(`${"+".repeat(50_000)}@`)).toBe(false);
  });

  it("contatti in chat: un segnale per persona con quanti messaggi; per il professionista Da guardare, per il cliente niente", () => {
    const signals = buildUserSignals({
      ...base,
      chatContacts: [
        { userId: "p", otherId: "a", otherLabel: "Anna Neri" },
        { userId: "p", otherId: "a", otherLabel: "Anna Neri" },
        { userId: "c", otherId: "p", otherLabel: "Idraulica Rossi" },
      ],
    });
    expect(signals.get("p")).toEqual([{ kind: "CONTACTS_IN_CHAT", detail: "2 messaggi con Anna Neri", others: [{ id: "a", label: "Anna Neri", role: "CLIENT" }] }]);
    expect(adviseSuspiciousUser("PROFESSIONAL", signals.get("p")!).level).toBe("MEDIA");
    expect(adviseSuspiciousUser("CLIENT", signals.get("c")!).level).toBe("BASSA");
  });

  it("ritorno con l'email di un account chiuso: sospeso = Da fare subito, altrimenti nessuna azione", () => {
    const signals = buildUserSignals({
      ...base,
      returned: [
        { userId: "a", closedAt: day(3), wasSuspended: true },
        { userId: "b", closedAt: day(3), wasSuspended: false },
      ],
    });
    expect(adviseSuspiciousUser("CLIENT", signals.get("a")!).level).toBe("ALTA");
    expect(adviseSuspiciousUser("CLIENT", signals.get("b")!).level).toBe("BASSA");
  });

  it("email usa e getta: anche un sottodominio, mai gmail", () => {
    expect(isDisposableEmail("x@mailinator.com")).toBe(true);
    expect(isDisposableEmail("x@eu.yopmail.com")).toBe(true);
    expect(isDisposableEmail("x@gmail.com")).toBe(false);
    const signals = buildUserSignals({ ...base, emails: [{ userId: "q", email: "pro@yopmail.com" }] });
    expect(adviseSuspiciousUser("PROFESSIONAL", signals.get("q")!).level).toBe("MEDIA");
  });

  it("ondata di recensioni: 3 in 7 giorni da clienti nuovi sì, 3 in 20 giorni no", () => {
    const review = (clientId: string, d: number) => ({ clientId, clientCreatedAt: day(1), createdAt: day(d), proUserId: "p", professionalLabel: "Idraulica Rossi" });
    const burst = buildUserSignals({ ...base, reviews: [review("a", 10), review("b", 12), review("c", 15)] });
    expect(burst.get("p")?.map((s) => s.kind)).toEqual(["REVIEW_BURST"]);
    expect(burst.get("p")?.[0]?.detail).toBe("3 recensioni in 7 giorni da clienti appena iscritti");
    const slow = buildUserSignals({ ...base, reviews: [review("a", 2), review("b", 12), review("c", 22)] });
    expect(slow.get("p")?.some((s) => s.kind === "REVIEW_BURST") ?? false).toBe(false);
  });

  it("problemi sul lavoro: 2 accolti contro il professionista, 2 respinti al cliente, solo negli ultimi 6 mesi", () => {
    const now = day(30);
    const issue = (status: string, d: Date) => ({ proUserId: "p", clientId: "a", status, createdAt: d });
    const signals = buildUserSignals({
      ...base,
      now,
      issues: [issue("UPHELD", day(10)), issue("UPHELD", day(20)), issue("REJECTED", day(15)), issue("REJECTED", new Date(Date.UTC(2026, 0, 1)))],
    });
    expect(signals.get("p")?.map((s) => s.kind)).toEqual(["MANY_UPHELD_ISSUES"]);
    expect(signals.has("a")).toBe(false);
  });

  it("Va bene così: resta finché non arriva un segnale nuovo o cambia il dettaglio", () => {
    const old = { kind: "CONTACTS_IN_CHAT" as const, detail: "1 messaggio con Anna Neri", others: [] };
    expect(hasNewSignals([old], [signalKey(old)])).toBe(false);
    expect(hasNewSignals([{ ...old, detail: "2 messaggi con Anna Neri" }], [signalKey(old)])).toBe(true);
    expect(hasNewSignals([], [signalKey(old)])).toBe(false);
  });
});
