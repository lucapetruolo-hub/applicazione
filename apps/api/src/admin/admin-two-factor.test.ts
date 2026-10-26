import { describe, expect, it } from "vitest";
import {
  base32Decode,
  base32Encode,
  hashResetCode,
  isAdminVerificationFresh,
  matchTotp,
  newResetCode,
  otpauthUrl,
  totpCode,
  totpStep,
} from "./admin-two-factor";

/** Verifica in due passaggi dell'area admin (docs/CHANGELOG.md §359). */
// Chiave degli esempi ufficiali di RFC 6238 ("12345678901234567890").
const RFC_SECRET = base32Encode(Buffer.from("12345678901234567890"));

describe("codici TOTP", () => {
  it("coincidono con gli esempi di RFC 6238 (ultime 6 cifre)", () => {
    expect(RFC_SECRET).toBe("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
    expect(totpCode(RFC_SECRET, totpStep(new Date(59_000)))).toBe("287082");
    expect(totpCode(RFC_SECRET, totpStep(new Date(1_111_111_109_000)))).toBe("081804");
    expect(totpCode(RFC_SECRET, totpStep(new Date(1_234_567_890_000)))).toBe("005924");
  });

  it("base32 va e torna", () => {
    const bytes = Buffer.from([0, 1, 2, 250, 251, 252, 253, 254, 255, 7]);
    expect(base32Decode(base32Encode(bytes)).equals(bytes)).toBe(true);
    expect(base32Decode("gezd gnbv").equals(base32Decode("GEZDGNBV"))).toBe(true);
  });

  it("accetta il codice di adesso e dei 30 secondi vicini, non quelli più lontani", () => {
    const at = new Date("2026-10-26T10:00:10Z");
    const now = totpStep(at);
    expect(matchTotp(RFC_SECRET, totpCode(RFC_SECRET, now), null, at)).toBe(now);
    expect(matchTotp(RFC_SECRET, totpCode(RFC_SECRET, now - 1), null, at)).toBe(now - 1);
    expect(matchTotp(RFC_SECRET, totpCode(RFC_SECRET, now + 1), null, at)).toBe(now + 1);
    expect(matchTotp(RFC_SECRET, totpCode(RFC_SECRET, now - 3), null, at)).toBeNull();
    expect(matchTotp(RFC_SECRET, "12345", null, at)).toBeNull();
    expect(matchTotp(RFC_SECRET, "abcdef", null, at)).toBeNull();
  });

  it("lo stesso codice non vale due volte", () => {
    const at = new Date("2026-10-26T10:00:10Z");
    const now = totpStep(at);
    const code = totpCode(RFC_SECRET, now);
    expect(matchTotp(RFC_SECRET, code, now, at)).toBeNull();
    expect(matchTotp(RFC_SECRET, code.slice(0, 3) + " " + code.slice(3), now - 1, at)).toBe(now);
  });

  it("l'indirizzo per il codice QR ha chiave ed emittente", () => {
    const url = otpauthUrl("ABCD", "luca@example.com", "Professionisti admin");
    expect(url.startsWith("otpauth://totp/Professionisti%20admin%3Aluca%40example.com?")).toBe(true);
    expect(url).toContain("secret=ABCD");
    expect(url).toContain("issuer=Professionisti+admin");
  });
});

describe("codice via email per il telefono perso", () => {
  it("ha 6 cifre", () => {
    for (let i = 0; i < 50; i++) expect(newResetCode()).toMatch(/^\d{6}$/);
  });
  it("l'impronta dipende dall'utente e non contiene il codice", () => {
    expect(hashResetCode("u1", "123456")).toBe(hashResetCode("u1", "123 456"));
    expect(hashResetCode("u1", "123456")).not.toBe(hashResetCode("u2", "123456"));
    expect(hashResetCode("u1", "123456")).not.toContain("123456");
  });
});

describe("durata del codice nell'area admin", () => {
  const enabledAt = new Date("2026-10-26T08:00:00Z");
  const now = new Date("2026-10-26T12:00:00Z");
  const seconds = (date: Date) => Math.floor(date.getTime() / 1000);
  it("vale 8 ore", () => {
    expect(isAdminVerificationFresh(seconds(new Date("2026-10-26T09:00:00Z")), enabledAt, now)).toBe(true);
    expect(isAdminVerificationFresh(seconds(new Date("2026-10-26T03:59:00Z")), new Date("2026-10-26T03:00:00Z"), now)).toBe(false);
  });
  it("non vale senza verifica attiva, senza codice o prima dell'attivazione", () => {
    expect(isAdminVerificationFresh(seconds(now), null, now)).toBe(false);
    expect(isAdminVerificationFresh(undefined, enabledAt, now)).toBe(false);
    expect(isAdminVerificationFresh(seconds(new Date("2026-10-26T07:00:00Z")), enabledAt, now)).toBe(false);
  });
});
