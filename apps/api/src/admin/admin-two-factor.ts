import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

/**
 * Verifica in due passaggi per l'area admin (docs/CHANGELOG.md §351): codici
 * a 6 cifre che cambiano ogni 30 secondi (TOTP, RFC 6238), gli stessi di
 * Google Authenticator, Microsoft Authenticator, 1Password o del portachiavi
 * dell'iPhone. Scritta con `node:crypto`, senza librerie: sono poche righe.
 */

export const TOTP_PERIOD_SECONDS = 30;
const TOTP_DIGITS = 6;
/** Un passo prima e uno dopo: l'orologio del telefono può essere avanti o indietro di qualche secondo. */
const TOTP_WINDOW = 1;

/** Dopo il codice l'area admin resta aperta per queste ore, poi lo richiede. */
export const ADMIN_2FA_VALID_HOURS = 8;

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(bytes: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return output;
}

export function base32Decode(text: string): Buffer {
  const clean = text.toUpperCase().replace(/[\s=-]/g, "");
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of clean) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index < 0) throw new Error("Chiave non valida.");
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/** Chiave nuova da 160 bit, in base32 come la vogliono le app. */
export function newTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

export function totpStep(at: Date = new Date()): number {
  return Math.floor(at.getTime() / 1000 / TOTP_PERIOD_SECONDS);
}

export function totpCode(secret: string, step: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const hmac = createHmac("sha1", base32Decode(secret)).update(counter).digest();
  const offset = hmac.readUInt8(hmac.length - 1) & 15;
  const binary = hmac.readUInt32BE(offset) & 0x7fffffff;
  return String(binary % 10 ** TOTP_DIGITS).padStart(TOTP_DIGITS, "0");
}

/**
 * Il passo del codice se è giusto, altrimenti null. Un passo già usato (o
 * precedente) non vale più: chi vede il codice sullo schermo non può
 * riusarlo.
 */
export function matchTotp(secret: string, typed: string, lastUsedStep: number | null, at: Date = new Date()): number | null {
  const code = typed.replace(/\s/g, "");
  if (!/^\d{6}$/.test(code)) return null;
  const now = totpStep(at);
  for (let delta = -TOTP_WINDOW; delta <= TOTP_WINDOW; delta++) {
    const step = now + delta;
    if (lastUsedStep !== null && step <= lastUsedStep) continue;
    if (timingSafeEqual(Buffer.from(totpCode(secret, step)), Buffer.from(code))) return step;
  }
  return null;
}

/** Indirizzo che le app leggono dal codice QR. */
export function otpauthUrl(secret: string, account: string, issuer: string): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const params = new URLSearchParams({ secret, issuer, algorithm: "SHA1", digits: String(TOTP_DIGITS), period: String(TOTP_PERIOD_SECONDS) });
  return `otpauth://totp/${label}?${params.toString()}`;
}

/** Chiave a gruppi di 4 per scriverla a mano: "ABCD EFGH ...". */
export function groupedSecret(secret: string): string {
  return secret.replace(/(.{4})/g, "$1 ").trim();
}

/** Telefono perso: codice di 6 cifre via email che azzera la verifica. */
export const ADMIN_RESET_CODE_MINUTES = 15;
export const ADMIN_RESET_CODE_RESEND_SECONDS = 60;

export function newResetCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

/** Nel database solo l'impronta, legata all'utente: chi legge la tabella non può usarla. */
export function hashResetCode(userId: string, code: string): string {
  return createHash("sha256").update(`admin-reset:${userId}:${code.replace(/\s/g, "")}`).digest("hex");
}

/** Il token porta l'ora del codice (`amfa`, secondi): vale per ADMIN_2FA_VALID_HOURS e solo se dopo l'attivazione. */
export function isAdminVerificationFresh(verifiedAtSeconds: number | undefined, enabledAt: Date | null, now: Date = new Date()): boolean {
  if (!verifiedAtSeconds || !enabledAt) return false;
  const verifiedAtMs = verifiedAtSeconds * 1000;
  if (verifiedAtMs < Math.floor(enabledAt.getTime() / 1000) * 1000) return false;
  if (verifiedAtMs > now.getTime() + 60_000) return false;
  return now.getTime() - verifiedAtMs <= ADMIN_2FA_VALID_HOURS * 60 * 60 * 1000;
}
