import { Prisma } from "@professionisti/database";
import { encryptFiscal, readFiscal } from "./fiscal-crypto";

/**
 * Codice fiscale cifrato nel database (controllo sicurezza, docs/CHANGELOG.md
 * §292), come l'IBAN: si cifra a ogni scrittura e si decifra a ogni lettura,
 * anche dentro un `include`, così il resto dell'API continua a vedere il
 * testo in chiaro. I valori salvati prima restano leggibili (`readFiscal`) e
 * all'avvio vengono cifrati (`FiscalEncryptionMigrationService`).
 * Campi: codice fiscale del titolare e del legale rappresentante, e il valore
 * controllato con Openapi (codice fiscale o P.IVA), il codice fiscale che il
 * cliente scrive per la fattura (docs/CHANGELOG.md §374).
 */
const ENCRYPTED_FIELDS = {
  professionalFiscalProfile: "fiscalCodiceFiscale",
  fiscalRepresentative: "codiceFiscale",
  taxIdCheck: "value",
  clientInvoiceRequest: "taxCode",
} as const;

type EncryptedModel = keyof typeof ENCRYPTED_FIELDS;

function encryptValue(value: unknown): unknown {
  if (typeof value === "string" && value) return encryptFiscal(value);
  if (value && typeof value === "object" && "set" in value) {
    const set = (value as { set: unknown }).set;
    return { set: typeof set === "string" && set ? encryptFiscal(set) : set };
  }
  return value;
}

function encryptData(model: EncryptedModel, data: unknown): unknown {
  if (Array.isArray(data)) return data.map((item) => encryptData(model, item));
  if (!data || typeof data !== "object") return data;
  const field = ENCRYPTED_FIELDS[model];
  if (!(field in data)) return data;
  return { ...data, [field]: encryptValue((data as Record<string, unknown>)[field]) };
}

const WRITE_OPERATIONS = new Set(["create", "createMany", "update", "updateMany", "upsert"]);

function encryptingQuery(model: EncryptedModel) {
  return {
    async $allOperations({ operation, args, query }: { operation: string; args: unknown; query: (args: unknown) => Promise<unknown> }) {
      if (!WRITE_OPERATIONS.has(operation) || !args || typeof args !== "object") return query(args);
      const next = { ...(args as Record<string, unknown>) };
      for (const key of ["data", "create", "update"]) {
        if (key in next) next[key] = encryptData(model, next[key]);
      }
      return query(next);
    },
  };
}

export const fiscalEncryptionExtension = Prisma.defineExtension({
  name: "fiscal-encryption",
  query: {
    professionalFiscalProfile: encryptingQuery("professionalFiscalProfile"),
    fiscalRepresentative: encryptingQuery("fiscalRepresentative"),
    taxIdCheck: encryptingQuery("taxIdCheck"),
    clientInvoiceRequest: encryptingQuery("clientInvoiceRequest"),
  },
  result: {
    professionalFiscalProfile: {
      fiscalCodiceFiscale: { needs: { fiscalCodiceFiscale: true }, compute: (row) => readFiscal(row.fiscalCodiceFiscale) },
    },
    fiscalRepresentative: {
      codiceFiscale: { needs: { codiceFiscale: true }, compute: (row) => readFiscal(row.codiceFiscale) },
    },
    taxIdCheck: {
      value: { needs: { value: true }, compute: (row) => readFiscal(row.value) ?? "" },
    },
    clientInvoiceRequest: {
      taxCode: { needs: { taxCode: true }, compute: (row) => readFiscal(row.taxCode) },
    },
  },
});
