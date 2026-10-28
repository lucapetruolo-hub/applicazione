import { describe, expect, it } from "vitest";
import { verifyEmailPerMinute } from "./link-rate-limit";

describe("limite al minuto del pulsante di conferma email", () => {
  it("resta 10 senza la variabile delle prove", () => {
    expect(verifyEmailPerMinute({})).toBe(10);
  });

  it("le prove nel browser lo alzano in locale e in CI", () => {
    expect(verifyEmailPerMinute({ E2E_VERIFY_EMAIL_PER_MINUTE: "1000" })).toBe(1000);
  });

  it("sul server pubblicato la variabile non vale mai", () => {
    expect(verifyEmailPerMinute({ E2E_VERIFY_EMAIL_PER_MINUTE: "1000", NODE_ENV: "production" })).toBe(10);
    expect(verifyEmailPerMinute({ E2E_VERIFY_EMAIL_PER_MINUTE: "1000", RENDER: "true" })).toBe(10);
  });

  it("un valore strano o più basso non cambia nulla", () => {
    expect(verifyEmailPerMinute({ E2E_VERIFY_EMAIL_PER_MINUTE: "tanti" })).toBe(10);
    expect(verifyEmailPerMinute({ E2E_VERIFY_EMAIL_PER_MINUTE: "3" })).toBe(10);
  });
});
