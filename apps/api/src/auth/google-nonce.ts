import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * `nonce` dell'accesso con Google emesso dal server (controllo pre-lancio
 * dell'08/11, miglioria di E2-01, docs/changelog/2026-11-08-sicurezza-controllo-lancio.md).
 *
 * Prima lo creava il browser e lo controllava solo il browser: un `id_token`
 * rubato (vale un'ora) portato direttamente a `POST /auth/google/verify`
 * entrava. Ora il sito chiede il `nonce` al server (`POST /auth/google/nonce`),
 * Google lo scrive nel token e il server accetta solo un `nonce` firmato da
 * lui, non scaduto e mai usato prima.
 *
 * Firmato con una chiave legata a `JWT_SECRET` ma distinta dalle sessioni
 * (come i link dei promemoria): emetterlo non occupa memoria, solo quelli
 * usati restano in memoria fino alla scadenza (un solo servizio Render, come
 * i biglietti dello stream in tempo reale).
 */

/** Quanto vale un `nonce`: il sito ne chiede uno nuovo ogni 20 minuti. */
export const GOOGLE_NONCE_TTL_MS = 30 * 60_000;

const used = new Map<string, number>();

function key(): Buffer {
  return createHmac("sha256", "google-nonce").update(process.env.JWT_SECRET ?? "dev-secret-change-me").digest();
}

function sign(body: string): string {
  return createHmac("sha256", key()).update(body).digest("base64url");
}

export function issueGoogleNonce(now = Date.now()): string {
  const body = `${(now + GOOGLE_NONCE_TTL_MS).toString(36)}.${randomBytes(16).toString("base64url")}`;
  return `${body}.${sign(body)}`;
}

/** `true` se il `nonce` è nostro, non scaduto e mai usato; da qui in poi non vale più. */
export function redeemGoogleNonce(nonce: string | undefined, now = Date.now()): boolean {
  if (!nonce) return false;
  const parts = nonce.split(".");
  if (parts.length !== 3) return false;
  const [expires, random, signature] = parts as [string, string, string];
  const expected = Buffer.from(sign(`${expires}.${random}`));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return false;
  const expiresAt = parseInt(expires, 36);
  if (!Number.isFinite(expiresAt) || expiresAt <= now) return false;
  for (const [code, until] of used) if (until <= now) used.delete(code);
  if (used.has(random)) return false;
  used.set(random, expiresAt);
  return true;
}
