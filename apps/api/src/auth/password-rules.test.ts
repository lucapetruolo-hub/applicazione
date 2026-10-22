import { describe, expect, it } from "vitest";
import {
  PASSWORD_CONTAINS_EMAIL_MESSAGE,
  PASSWORD_RULES,
  acceptProfileInviteSchema,
  changePasswordSchema,
  emailPasswordSchema,
  passwordContainsEmail,
  passwordProblem,
  passwordResetConfirmSchema,
  registerSchema,
} from "@professionisti/shared";

const ok = (password: string) => passwordProblem(password) === null;

describe("regole della password nuova (docs/CHANGELOG.md §289)", () => {
  it("le due regole sotto il campo, niente simbolo obbligatorio", () => {
    expect(PASSWORD_RULES.map((rule) => rule.id)).toEqual(["length", "number"]);
    expect(ok("abc1")).toBe(false); // corta
    expect(ok("abcdefgh!")).toBe(false); // senza numero
    expect(ok("abcdefg1")).toBe(true);
    expect(ok("pane e vino 1")).toBe(true); // gli spazi sono ammessi
  });

  it("accetta al primo colpo le password suggerite da iPhone e Google", () => {
    // Formato del portachiavi di iPhone/Mac: tre gruppi separati dal trattino.
    expect(ok("xujqo2-pozdyN-kabdem")).toBe(true);
    // Gestore di Google (Chrome/Android): 15 caratteri, lettere e numeri, nessun simbolo.
    expect(ok("Xk9mPq2LrT4wZs7")).toBe(true);
  });

  it("lettere accentate, numeri non latini ed emoji contano come caratteri, non come byte", () => {
    expect(ok("città2026€")).toBe(true);
    expect(passwordProblem("aé1")).toContain("almeno 8 caratteri");
  });

  it("massimo 64 caratteri e 72 byte (limite di bcrypt)", () => {
    expect(ok(`${"a".repeat(62)}1!`)).toBe(true);
    expect(passwordProblem(`${"a".repeat(63)}1!`)).toContain("al massimo 64");
    expect(passwordProblem(`${"é".repeat(40)}1!`)).toContain("al massimo 64");
  });

  it("il messaggio elenca solo le regole che mancano", () => {
    expect(passwordProblem("abcdefgh")).toBe("La password deve avere: almeno un numero.");
    expect(passwordProblem("abc")).toBe("La password deve avere: almeno 8 caratteri, almeno un numero.");
  });

  it("stesse regole in tutti i punti dove si sceglie una password nuova", () => {
    const base = { email: "a@b.it", acceptedLegalTerms: true, declaredAdult: true, role: "CLIENT" as const };
    expect(registerSchema.safeParse({ ...base, password: "abcdefgh" }).success).toBe(false);
    expect(registerSchema.safeParse({ ...base, password: "abcdefg1" }).success).toBe(true);
    expect(changePasswordSchema.safeParse({ newPassword: "abcdefgh" }).success).toBe(false);
    expect(passwordResetConfirmSchema.safeParse({ token: "x".repeat(32), password: "abcdefgh" }).success).toBe(false);
    expect(
      acceptProfileInviteSchema.safeParse({ token: "x".repeat(32), password: "abcdefgh", acceptedLegalTerms: true, declaredAdult: true }).success,
    ).toBe(false);
  });

  it("rifiuta le password che contengono l'email (OWASP 6.2.11)", () => {
    expect(passwordContainsEmail("Mario.Rossi2026", "mario.rossi@gmail.com")).toBe(true); // maiuscole ignorate
    expect(passwordContainsEmail("xx-mario.rossi@gmail.com-1", "mario.rossi@gmail.com")).toBe(true);
    expect(passwordContainsEmail("luca1234", "lu@gmail.com")).toBe(false); // parte troppo corta per contare
    expect(passwordContainsEmail("Ciao-Mondo-2026", "mario.rossi@gmail.com")).toBe(false);
    expect(passwordContainsEmail("qualcosa1", null)).toBe(false);
    expect(passwordProblem("mariorossi1", "mariorossi@libero.it")).toBe(PASSWORD_CONTAINS_EMAIL_MESSAGE);
    // Prima le regole che mancano, poi l'email.
    expect(passwordProblem("mariorossi", "mariorossi@libero.it")).toBe("La password deve avere: almeno un numero.");
  });

  it("l'accesso accetta ancora le password create prima delle regole", () => {
    expect(emailPasswordSchema.safeParse({ email: "a@b.it", password: "abcdefgh" }).success).toBe(true);
  });
});
