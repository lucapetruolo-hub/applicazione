import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * Cifratura dei dati fiscali più delicati (IBAN, docs/CHANGELOG.md §246):
 * AES-256-GCM con una chiave dedicata `FISCAL_DATA_KEY` (su Render), non
 * legata a `JWT_SECRET`: ruotare la chiave delle sessioni non deve rendere
 * illeggibili gli IBAN. Senza la variabile (sviluppo) si ricade su
 * `JWT_SECRET`, come gli inviti (`profile-invites.service.ts`).
 */
function keyFrom(secret: string): Buffer {
  return createHash("sha256").update(`fiscal-data:${secret}`).digest();
}

function legacySecret(): string {
  return process.env.JWT_SECRET ?? "dev-secret-change-me";
}

function fiscalKey(): Buffer {
  return keyFrom(process.env.FISCAL_DATA_KEY?.trim() || legacySecret());
}

/**
 * Chiave usata prima che `FISCAL_DATA_KEY` fosse impostata (derivata da
 * `JWT_SECRET`): serve solo a rileggere e ricifrare i dati salvati allora
 * (controllo sicurezza, docs/CHANGELOG.md §292). null se coincide con l'attuale.
 */
function legacyFiscalKey(): Buffer | null {
  return process.env.FISCAL_DATA_KEY?.trim() ? keyFrom(legacySecret()) : null;
}

export function encryptFiscal(value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", fiscalKey(), iv);
  const data = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((part) => part.toString("base64url")).join(".");
}

function decryptWith(key: Buffer, value: string): string | null {
  try {
    const [iv, tag, data] = value.split(".").map((part) => Buffer.from(part, "base64url"));
    // Sigillo sempre di 16 byte: Node ne accetterebbe anche uno più corto, più facile da indovinare (§313).
    if (!iv || !tag || !data || tag.length !== 16) return null;
    const decipher = createDecipheriv("aes-256-gcm", key, iv, { authTagLength: 16 });
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

/** null se la chiave è cambiata o il dato è rovinato: mai un'eccezione che blocca il file DAC7. */
export function decryptFiscal(value: string): string | null {
  const plain = decryptWith(fiscalKey(), value);
  if (plain !== null) return plain;
  const legacy = legacyFiscalKey();
  return legacy ? decryptWith(legacy, value) : null;
}

/**
 * Il dato ricifrato con la chiave attuale se era ancora cifrato con quella
 * vecchia, altrimenti null (già a posto, oppure illeggibile).
 */
export function reencryptLegacyFiscal(value: string): string | null {
  const legacy = legacyFiscalKey();
  if (!legacy || decryptWith(fiscalKey(), value) !== null) return null;
  const plain = decryptWith(legacy, value);
  return plain === null ? null : encryptFiscal(plain);
}

const ENCRYPTED_FORMAT = /^[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]+$/;

/** Il dato è già cifrato da `encryptFiscal` (iv da 12 byte, tag da 16). */
export function isEncryptedFiscal(value: string): boolean {
  return ENCRYPTED_FORMAT.test(value);
}

/**
 * Lettura di un campo cifrato che può essere ancora in chiaro (salvato prima
 * della cifratura, docs/CHANGELOG.md §292): il testo in chiaro torna così com'è.
 */
export function readFiscal(value: string | null): string | null {
  if (value === null || !isEncryptedFiscal(value)) return value;
  return decryptFiscal(value);
}
