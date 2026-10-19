import { describe, expect, it, vi } from "vitest";
import { birthDateFromCodiceFiscale, codiceFiscaleMismatches, codiceFiscaleMismatchMessage, fiscalFieldErrors } from "@professionisti/shared";
import { nextTaxIdAttempt, wantedTaxIdChecks, MAX_TAX_ID_ATTEMPTS } from "./tax-id-check.service";
import { partitaIvaOutcome } from "./openapi-tax-id.provider";
import { ViesFirstTaxIdProvider, viesLookup } from "./vies-tax-id.provider";

/** Controlli gratuiti e scelta dei controlli Openapi (docs/CHANGELOG.md §259). */
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

/** Partita IVA prima con VIES, poi Openapi (docs/CHANGELOG.md §254-§255). */
describe("VIES prima di Openapi", () => {
  const openapi = {
    name: "openapi",
    checkCodiceFiscale: vi.fn(async () => ({ outcome: "VALID" as const })),
    checkPartitaIva: vi.fn(async () => ({ outcome: "VALID" as const, detail: "ATTIVA", officialName: "ROSSI MARIO" })),
  };

  it("se VIES conferma non chiama Openapi", async () => {
    openapi.checkPartitaIva.mockClear();
    const provider = new ViesFirstTaxIdProvider(openapi, async () => ({ outcome: "VALID", detail: "ATTIVA", source: "vies" }));
    expect(await provider.checkPartitaIva("12485671007")).toMatchObject({ outcome: "VALID", source: "vies" });
    expect(openapi.checkPartitaIva).not.toHaveBeenCalled();
  });

  it("se VIES dice non valida, è lenta o non risponde passa subito a Openapi", async () => {
    openapi.checkPartitaIva.mockClear();
    const provider = new ViesFirstTaxIdProvider(openapi, async () => null);
    expect(await provider.checkPartitaIva("12485671007")).toMatchObject({ outcome: "VALID", officialName: "ROSSI MARIO" });
    expect(openapi.checkPartitaIva).toHaveBeenCalledOnce();
  });

  it("il codice fiscale va sempre a Openapi", async () => {
    openapi.checkCodiceFiscale.mockClear();
    const lookup = vi.fn(async () => null);
    await new ViesFirstTaxIdProvider(openapi, lookup).checkCodiceFiscale("RSSMRA80A01H501U");
    expect(openapi.checkCodiceFiscale).toHaveBeenCalledOnce();
    expect(lookup).not.toHaveBeenCalled();
  });

  it("legge la risposta di VIES: valida con nome, oppure nessun esito", async () => {
    const reply = (body: unknown, ok = true) => (async () => ({ ok, json: async () => body })) as unknown as typeof fetch;
    expect(await viesLookup("12485671007", reply({ isValid: true, name: "ROSSI MARIO" }))).toEqual({ outcome: "VALID", detail: "ATTIVA", officialName: "ROSSI MARIO", source: "vies" });
    expect(await viesLookup("12485671007", reply({ isValid: true, name: "---" }))).toMatchObject({ officialName: null });
    expect(await viesLookup("12485671007", reply({ isValid: false }))).toBeNull();
    expect(await viesLookup("12485671007", reply({}, false))).toBeNull();
    const down = (async () => {
      throw new Error("timeout");
    }) as unknown as typeof fetch;
    expect(await viesLookup("12485671007", down)).toBeNull();
  });

  it("il codice fiscale del legale rappresentante non va a Openapi: lo conferma il documento", () => {
    expect(wantedTaxIdChecks({ entityType: "BUSINESS", fiscalIdIssuingCountry: "IT", fiscalCodiceFiscale: null, vatNumber: "12485671007" })).toEqual([
      { kind: "PARTITA_IVA", value: "12485671007" },
    ]);
  });
});
