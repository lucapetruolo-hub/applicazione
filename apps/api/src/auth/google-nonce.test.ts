import { describe, expect, it } from "vitest";
import { GOOGLE_NONCE_TTL_MS, issueGoogleNonce, redeemGoogleNonce } from "./google-nonce";

describe("nonce dell'accesso con Google", () => {
  it("vale una volta sola", () => {
    const nonce = issueGoogleNonce();
    expect(redeemGoogleNonce(nonce)).toBe(true);
    expect(redeemGoogleNonce(nonce)).toBe(false);
  });

  it("scade dopo 30 minuti", () => {
    const now = Date.now();
    const nonce = issueGoogleNonce(now);
    expect(redeemGoogleNonce(nonce, now + GOOGLE_NONCE_TTL_MS + 1)).toBe(false);
  });

  it("rifiuta un nonce modificato o non firmato da noi", () => {
    const [expires, random, signature] = issueGoogleNonce().split(".") as [string, string, string];
    const later = (parseInt(expires, 36) + 86_400_000).toString(36);
    expect(redeemGoogleNonce(`${later}.${random}.${signature}`)).toBe(false);
    expect(redeemGoogleNonce(`${expires}.${random}.${signature.slice(1)}x`)).toBe(false);
    expect(redeemGoogleNonce(crypto.randomUUID().replace(/-/g, ""))).toBe(false);
    expect(redeemGoogleNonce(undefined)).toBe(false);
  });
});
