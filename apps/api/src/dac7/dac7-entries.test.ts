import { describe, expect, it } from "vitest";
import { checkIban, completionDeclaration, dac7Entries, formatIban, type Dac7PaymentInput } from "@professionisti/shared";
import { compareWithStripe } from "../professional-fiscal/payout-account.service";
import { decryptFiscal, encryptFiscal } from "../common/fiscal-crypto";

const jan = new Date(Date.UTC(2026, 0, 10));
const mar31 = new Date(Date.UTC(2026, 2, 31, 22));
const apr = new Date(Date.UTC(2026, 3, 5));

function payment(overrides: Partial<Dac7PaymentInput>): Dac7PaymentInput {
  return {
    paymentMethod: "DIRECT",
    status: "AWAITING_CONFIRMATION",
    netAmountEurCents: 20000,
    platformFeeEurCents: 0,
    balanceDirect: false,
    depositEurCents: null,
    directReportedAt: jan,
    releasedAt: null,
    updatedAt: apr,
    booking: { professionalProfileId: "pro-1", finalAmountEurCents: 20000, professionalCompletedAt: jan },
    ...overrides,
  };
}

describe("dac7Entries", () => {
  it("conta il diretto appena dichiarato, senza conferma del cliente, nel giorno della dichiarazione", () => {
    const entries = dac7Entries(payment({}), true);
    expect(entries).toEqual([{ professionalProfileId: "pro-1", date: jan, directEurCents: 20000, onlineEurCents: 0, feesEurCents: 0 }]);
  });

  it("non sposta il diretto nel trimestre dell'ultima modifica", () => {
    expect(dac7Entries(payment({ status: "CONFIRMED", updatedAt: apr }), true)[0]?.date).toEqual(jan);
  });

  it("esclude i diretti se la regola DAC7 li esclude", () => {
    expect(dac7Entries(payment({}), false)).toEqual([]);
  });

  it("conta l'online quando i soldi passano al professionista, al netto della commissione", () => {
    const entries = dac7Entries(
      payment({ paymentMethod: "MANOVIA", status: "CONFIRMED", netAmountEurCents: 18650, platformFeeEurCents: 1000, releasedAt: mar31, directReportedAt: null }),
      true,
    );
    expect(entries).toEqual([{ professionalProfileId: "pro-1", date: mar31, directEurCents: 0, onlineEurCents: 18650, feesEurCents: 1000 }]);
  });

  it("ignora l'online non ancora passato al professionista o rimborsato", () => {
    expect(dac7Entries(payment({ paymentMethod: "MANOVIA", status: "PENDING" }), true)).toEqual([]);
    expect(dac7Entries(payment({ paymentMethod: "MANOVIA", status: "REFUNDED" }), true)).toEqual([]);
  });

  it("acconto online e saldo diretto: separa le due parti", () => {
    const entries = dac7Entries(
      payment({
        paymentMethod: "MANOVIA",
        status: "CONFIRMED",
        balanceDirect: true,
        depositEurCents: 4000,
        netAmountEurCents: 3700,
        platformFeeEurCents: 200,
        releasedAt: apr,
        directReportedAt: null,
        booking: { professionalProfileId: "pro-1", finalAmountEurCents: 20000, professionalCompletedAt: mar31 },
      }),
      true,
    );
    expect(entries).toEqual([
      { professionalProfileId: "pro-1", date: apr, directEurCents: 0, onlineEurCents: 3700, feesEurCents: 200 },
      { professionalProfileId: "pro-1", date: mar31, directEurCents: 16000, onlineEurCents: 0, feesEurCents: 0 },
    ]);
  });
});

describe("checkIban", () => {
  it("accetta un IBAN valido scritto con spazi e minuscole", () => {
    expect(checkIban("it60 x054 2811 1010 0000 0123 456")).toEqual({ ok: true, iban: "IT60X0542811101000000123456" });
    expect(formatIban("IT60X0542811101000000123456")).toBe("IT60 X054 2811 1010 0000 0123 456");
  });

  it("spiega cosa non va", () => {
    const wrongDigit = checkIban("IT60X0542811101000000123457");
    expect(wrongDigit.ok).toBe(false);
    const short = checkIban("IT60X05428111010000001234");
    expect(short).toMatchObject({ ok: false, message: expect.stringContaining("27 caratteri") });
    expect(checkIban("US12345")).toMatchObject({ ok: false });
    expect(checkIban("")).toMatchObject({ ok: false });
  });
});

describe("compareWithStripe", () => {
  it("confronta paese e ultime 4 cifre", () => {
    const iban = { country: "IT", last4: "3456" };
    expect(compareWithStripe(iban, [{ country: "IT", last4: "3456" }])).toBe("MATCH");
    expect(compareWithStripe(iban, [{ country: "IT", last4: "9999" }])).toBe("MISMATCH");
    expect(compareWithStripe(iban, [])).toBe("UNAVAILABLE");
    expect(compareWithStripe(iban, null)).toBe("UNAVAILABLE");
  });
});

describe("completionDeclaration", () => {
  it("cambia testo e versione tra privato e partita IVA", () => {
    expect(completionDeclaration("PRIVATE_INDIVIDUAL").text).toContain("prestazione occasionale");
    expect(completionDeclaration("SOLE_PROPRIETOR").text).toContain("fattura");
    expect(completionDeclaration("BUSINESS").version).toBe(completionDeclaration("SOLE_PROPRIETOR").version);
    expect(completionDeclaration(null).version).not.toBe(completionDeclaration("PRIVATE_INDIVIDUAL").version);
  });
});

describe("cifratura IBAN", () => {
  it("si rilegge solo con la stessa chiave", () => {
    const encrypted = encryptFiscal("IT60X0542811101000000123456");
    expect(encrypted).not.toContain("IT60");
    expect(decryptFiscal(encrypted)).toBe("IT60X0542811101000000123456");
    expect(decryptFiscal("rovinato")).toBeNull();
  });
});
