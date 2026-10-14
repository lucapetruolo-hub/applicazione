import { describe, expect, it } from "vitest";
import { birthDateFromCodiceFiscale, codiceFiscaleMismatches, codiceFiscaleMismatchMessage, fiscalFieldErrors } from "@professionisti/shared";
import { nextTaxIdAttempt, wantedTaxIdChecks, MAX_TAX_ID_ATTEMPTS } from "./tax-id-check.service";
import { partitaIvaOutcome } from "./openapi-tax-id.provider";

/** Controlli gratuiti e scelta dei controlli Openapi (docs/CHANGELOG.md §243). */
describe("coerenza del codice fiscale con nome, cognome e data di nascita", () => {
  it("accetta i dati giusti, anche con omocodia, più nomi e donne (giorno + 40)", () => {
    expect(codiceFiscaleMismatches("RSSMRA80A01H501U", { firstName: "Mario", lastName: "Rossi", dateOfBirth: "1980-01-01" })).toEqual([]);
    expect(codiceFiscaleMismatches("RSSMRA80A01H50MM", { firstName: "Mario", lastName: "Rossi", dateOfBirth: "1980-01-01" })).toEqual([]);
    expect(codiceFiscaleMismatches("VRDGPP75M41F205V", { firstName: "Giuseppina", lastName: "Verdi", dateOfBirth: "1975-08-01" })).toEqual([]);
    expect(codiceFiscaleMismatches("BNCMGR90E52L219K", { firstName: "Maria Grazia", lastName: "Bianchi", dateOfBirth: "1990-05-12" })).toEqual([]);
  });

  it("dice cosa non torna", () => {
    expect(codiceFiscaleMismatches("RSSMRA80A01H501U", { firstName: "Luca", lastName: "Rossi", dateOfBirth: "1980-01-02" })).toEqual(["nome", "data di nascita"]);
    expect(codiceFiscaleMismatches("BNCMGR90E52L219K", { firstName: "Maria", lastName: "Bianchi" })).toEqual(["nome"]);
    expect(codiceFiscaleMismatchMessage(["nome"])).toContain("Se hai più nomi");
  });

  it("data di nascita ricavata dal codice fiscale (per il legale rappresentante)", () => {
    expect(birthDateFromCodiceFiscale("RSSMRA80A01H501U")).toBe("1980-01-01");
    expect(birthDateFromCodiceFiscale("VRDGPP75M41F205V")).toBe("1975-08-01");
    expect(birthDateFromCodiceFiscale("non valido")).toBeNull();
  });

  it("sul server gli stessi controlli del browser", () => {
    expect(fiscalFieldErrors({ entityType: "PRIVATE_INDIVIDUAL", fiscalCodiceFiscale: "RSSMRA80A01H501X" })[0]?.field).toBe("fiscalCodiceFiscale");
    expect(fiscalFieldErrors({ entityType: "SOLE_PROPRIETOR", vatNumber: "12345678901" })[0]?.field).toBe("vatNumber");
    expect(fiscalFieldErrors({ entityType: "SOLE_PROPRIETOR", vatNumber: "12485671007", fiscalCodiceFiscale: "RSSMRA80A01H501U", fiscalFirstName: "Mario", fiscalLastName: "Rossi", dateOfBirth: "1980-01-01" })).toEqual([]);
    expect(fiscalFieldErrors({ entityType: "BUSINESS", vatNumber: "12485671007", representative: { firstName: "Anna", lastName: "Rossi", codiceFiscale: "RSSMRA80A01H501U" } })[0]?.field).toBe(
      "representative.codiceFiscale",
    );
    // Codice estero: solo il controllo di forma, nessuna coerenza.
    expect(fiscalFieldErrors({ entityType: "PRIVATE_INDIVIDUAL", fiscalIdIssuingCountry: "FR", fiscalCodiceFiscale: "1234567890123" })).toEqual([]);
  });
});

describe("controlli Openapi", () => {
  it("controlla solo dati italiani già corretti nella forma", () => {
    expect(wantedTaxIdChecks({ entityType: "PRIVATE_INDIVIDUAL", fiscalIdIssuingCountry: null, fiscalCodiceFiscale: "rssmra80a01h501u", vatNumber: null })).toEqual([
      { kind: "CODICE_FISCALE", value: "RSSMRA80A01H501U" },
    ]);
    expect(wantedTaxIdChecks({ entityType: "SOLE_PROPRIETOR", fiscalIdIssuingCountry: "IT", fiscalCodiceFiscale: "RSSMRA80A01H501U", vatNumber: "124 8567 1007" })).toHaveLength(2);
    expect(wantedTaxIdChecks({ entityType: "BUSINESS", fiscalIdIssuingCountry: "IT", fiscalCodiceFiscale: "RSSMRA80A01H501U", vatNumber: "12485671007" })).toEqual([
      { kind: "PARTITA_IVA", value: "12485671007" },
    ]);
    expect(wantedTaxIdChecks({ entityType: "PRIVATE_INDIVIDUAL", fiscalIdIssuingCountry: "DE", fiscalCodiceFiscale: "RSSMRA80A01H501U", vatNumber: null })).toEqual([]);
    expect(wantedTaxIdChecks({ entityType: "PRIVATE_INDIVIDUAL", fiscalIdIssuingCountry: null, fiscalCodiceFiscale: "RSSMRA80A01H501X", vatNumber: null })).toEqual([]);
  });

  it("stato della partita IVA", () => {
    expect(partitaIvaOutcome("ATTIVA")).toBe("VALID");
    expect(partitaIvaOutcome("CESSATA")).toBe("INVALID");
    expect(partitaIvaOutcome("SOSPESA")).toBe("REVIEW");
    expect(partitaIvaOutcome("")).toBe("REVIEW");
  });

  it("nuovi tentativi sempre più distanti, poi si smette", () => {
    const now = new Date("2026-10-14T10:00:00Z");
    expect(nextTaxIdAttempt(1, now)?.toISOString()).toBe("2026-10-14T10:15:00.000Z");
    expect(nextTaxIdAttempt(3, now)?.toISOString()).toBe("2026-10-14T11:00:00.000Z");
    expect(nextTaxIdAttempt(7, now)?.toISOString()).toBe("2026-10-14T22:00:00.000Z");
    expect(nextTaxIdAttempt(MAX_TAX_ID_ATTEMPTS, now)).toBeNull();
  });
});
