import { afterEach, describe, expect, it } from "vitest";
import { decryptFiscal, encryptFiscal, reencryptLegacyFiscal } from "./fiscal-crypto";

const IBAN = "IT60X0542811101000000123456";
const original = { fiscal: process.env.FISCAL_DATA_KEY, jwt: process.env.JWT_SECRET };

afterEach(() => {
  process.env.FISCAL_DATA_KEY = original.fiscal;
  process.env.JWT_SECRET = original.jwt;
  if (original.fiscal === undefined) delete process.env.FISCAL_DATA_KEY;
  if (original.jwt === undefined) delete process.env.JWT_SECRET;
});

describe("passaggio a FISCAL_DATA_KEY", () => {
  it("rilegge e ricifra gli IBAN salvati con la chiave di JWT_SECRET", () => {
    process.env.JWT_SECRET = "segreto-sessioni";
    delete process.env.FISCAL_DATA_KEY;
    const legacy = encryptFiscal(IBAN);
    expect(reencryptLegacyFiscal(legacy)).toBeNull();

    process.env.FISCAL_DATA_KEY = "chiave-dati-fiscali";
    expect(decryptFiscal(legacy)).toBe(IBAN);
    const reencrypted = reencryptLegacyFiscal(legacy);
    expect(reencrypted).not.toBeNull();
    expect(reencryptLegacyFiscal(reencrypted as string)).toBeNull();

    // Ruotare JWT_SECRET non tocca più gli IBAN ricifrati.
    process.env.JWT_SECRET = "segreto-nuovo";
    expect(decryptFiscal(reencrypted as string)).toBe(IBAN);
    expect(decryptFiscal(legacy)).toBeNull();
  });
});
