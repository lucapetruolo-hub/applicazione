import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * Cifratura dei dati fiscali più delicati (IBAN, docs/CHANGELOG.md §243):
 * AES-256-GCM con una chiave dedicata `FISCAL_DATA_KEY` (su Render), non
 * legata a `JWT_SECRET`: ruotare la chiave delle sessioni non deve rendere
 * illeggibili gli IBAN. Senza la variabile (sviluppo) si ricade su
 * `JWT_SECRET`, come gli inviti (`profile-invites.service.ts`).
 */
function fiscalKey(): Buffer {
  const secret = process.env.FISCAL_DATA_KEY ?? process.env.JWT_SECRET ?? "dev-secret-change-me";
  return createHash("sha256").update(`fiscal-data:${secret}`).digest();
}

export function encryptFiscal(value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", fiscalKey(), iv);
  const data = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((part) => part.toString("base64url")).join(".");
}

/** null se la chiave è cambiata o il dato è rovinato: mai un'eccezione che blocca il file DAC7. */
export function decryptFiscal(value: string): string | null {
  try {
    const [iv, tag, data] = value.split(".").map((part) => Buffer.from(part, "base64url"));
    if (!iv || !tag || !data) return null;
    const decipher = createDecipheriv("aes-256-gcm", fiscalKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
