import { describe, expect, it } from "vitest";
import {
  emailPasswordSchema,
  emailStatusSchema,
  passwordResetCodeSchema,
  passwordResetRequestSchema,
  registerSchema,
  updateAccountSchema,
} from "@professionisti/shared";

/** Email degli account sempre senza spazi e in minuscolo (docs/CHANGELOG.md §330). */
describe("email degli account", () => {
  const typed = "  Mario.Rossi@Gmail.COM ";
  const saved = "mario.rossi@gmail.com";

  it("accesso, stato dell'email e recupero password cercano l'email in minuscolo", () => {
    expect(emailPasswordSchema.parse({ email: typed, password: "password1" }).email).toBe(saved);
    expect(emailStatusSchema.parse({ email: typed }).email).toBe(saved);
    expect(passwordResetRequestSchema.parse({ email: typed }).email).toBe(saved);
    expect(passwordResetCodeSchema.parse({ email: typed, code: "123456" }).email).toBe(saved);
  });

  it("registrazione e modifica dell'account la salvano in minuscolo", () => {
    const registered = registerSchema.parse({ email: typed, password: "password1", name: "Mario", role: "CLIENT", acceptedLegalTerms: true, declaredAdult: true });
    expect(registered.email).toBe(saved);
    expect(updateAccountSchema.parse({ email: typed }).email).toBe(saved);
  });

  it("un'email non valida resta rifiutata con lo stesso messaggio", () => {
    const result = passwordResetRequestSchema.safeParse({ email: "mario@" });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe("Email non valida");
  });
});
