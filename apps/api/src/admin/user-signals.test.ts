import { describe, expect, it } from "vitest";
import { adviseSuspiciousUser, sortSuspiciousUsers } from "@professionisti/shared";
import { buildUserSignals, normalizeAddress, normalizePhone, type SignalInput } from "./user-signals";

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
