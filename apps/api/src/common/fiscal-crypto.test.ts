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

describe("codice fiscale cifrato", () => {
  it("legge sia il dato cifrato sia quello salvato in chiaro prima", async () => {
    const { isEncryptedFiscal, readFiscal } = await import("./fiscal-crypto");
    const encrypted = encryptFiscal("RSSMRA80A01H501U");
    expect(isEncryptedFiscal(encrypted)).toBe(true);
    expect(isEncryptedFiscal("RSSMRA80A01H501U")).toBe(false);
    expect(isEncryptedFiscal("12345678901")).toBe(false);
    expect(readFiscal(encrypted)).toBe("RSSMRA80A01H501U");
    expect(readFiscal("RSSMRA80A01H501U")).toBe("RSSMRA80A01H501U");
    expect(readFiscal(null)).toBeNull();
  });

  it("all'avvio riscrive solo i dati in chiaro o con la chiave vecchia", async () => {
    const { toRewrite } = await import("../professional-fiscal/fiscal-encryption-migration.service");
    process.env.JWT_SECRET = "segreto-sessioni";
    delete process.env.FISCAL_DATA_KEY;
    const legacy = encryptFiscal("RSSMRA80A01H501U");
    expect(toRewrite("RSSMRA80A01H501U")).toBe("RSSMRA80A01H501U");
    expect(toRewrite(legacy)).toBeNull();
    expect(toRewrite(null)).toBeNull();
    process.env.FISCAL_DATA_KEY = "chiave-dati-fiscali";
    expect(toRewrite(legacy)).toBe("RSSMRA80A01H501U");
    expect(toRewrite(encryptFiscal("RSSMRA80A01H501U"))).toBeNull();
  });
});

describe("sigillo del dato cifrato", () => {
  it("rifiuta un sigillo accorciato", () => {
    process.env.FISCAL_DATA_KEY = "chiave-dati-fiscali";
    const [iv, tag, data] = encryptFiscal(IBAN).split(".") as [string, string, string];
    const shortTag = Buffer.from(tag, "base64url").subarray(0, 4).toString("base64url");
    expect(decryptFiscal(`${iv}.${shortTag}.${data}`)).toBeNull();
    expect(decryptFiscal(`${iv}.${tag}.${data}`)).toBe(IBAN);
  });
});
