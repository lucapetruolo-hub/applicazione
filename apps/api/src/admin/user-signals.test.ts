import { describe, expect, it } from "vitest";
import { buildUserSignals, normalizeAddress, normalizePhone, type SignalInput } from "./user-signals";

/** Segnali da controllare (docs/changelog/2026-10-30-admin-persone.md). */
const base: SignalInput = {
  people: [
    { id: "a", label: "Anna Neri" },
    { id: "b", label: "Bruno Neri" },
    { id: "c", label: "Carla Blu" },
    { id: "p", label: "Idraulica Rossi" },
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
    expect(signals.get("a")).toEqual([{ kind: "SAME_PHONE", detail: "anche Bruno Neri", others: [{ id: "b", label: "Bruno Neri" }] }]);
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
        { clientId: "a", clientCreatedAt: day(1), createdAt: day(2), professionalLabel: "Idraulica Rossi" },
        { clientId: "c", clientCreatedAt: day(1), createdAt: day(10), professionalLabel: "Idraulica Rossi" },
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
});
