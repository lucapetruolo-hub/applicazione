import { describe, expect, it } from "vitest";
import {
  PASSWORD_RULES,
  acceptProfileInviteSchema,
  changePasswordSchema,
  emailPasswordSchema,
  passwordProblem,
  passwordResetConfirmSchema,
  registerSchema,
} from "@professionisti/shared";

const ok = (password: string) => passwordProblem(password) === null;

describe("regole della password nuova (docs/CHANGELOG.md §289)", () => {
  it("le tre regole sotto il campo", () => {
    expect(PASSWORD_RULES.map((rule) => rule.id)).toEqual(["length", "number", "symbol"]);
    expect(ok("abc1!")).toBe(false); // corta
    expect(ok("abcdefgh!")).toBe(false); // senza numero
    expect(ok("abcdefgh1")).toBe(false); // senza simbolo
    expect(ok("abcdefg1!")).toBe(true);
    expect(ok("pane e vino 1!")).toBe(true); // gli spazi sono ammessi ma non contano come simbolo
    expect(ok("pane e vino 12")).toBe(false);
  });

  it("accetta al primo colpo le password suggerite da iPhone e Google", () => {
    // Formato del portachiavi di iPhone/Mac: tre gruppi separati dal trattino.
    expect(ok("xujqo2-pozdyN-kabdem")).toBe(true);
    // Gestore di Google (Chrome/Android): 15 caratteri, lettere e numeri, nessun simbolo.
    expect(ok("Xk9mPq2LrT4wZs7")).toBe(true);
    expect(ok("Xk9mPq2LrT4wZs")).toBe(false); // 14 senza simbolo: no
  });

  it("lettere accentate, numeri non latini ed emoji contano come caratteri, non come byte", () => {
    expect(ok("città2026€")).toBe(true);
    expect(passwordProblem("aé1!")).toContain("almeno 8 caratteri");
  });

  it("massimo 64 caratteri e 72 byte (limite di bcrypt)", () => {
    expect(ok(`${"a".repeat(62)}1!`)).toBe(true);
    expect(passwordProblem(`${"a".repeat(63)}1!`)).toContain("al massimo 64");
    expect(passwordProblem(`${"é".repeat(40)}1!`)).toContain("al massimo 64");
  });

  it("il messaggio elenca solo le regole che mancano", () => {
    expect(passwordProblem("abcdefgh")).toBe("La password deve avere: almeno un numero, almeno un simbolo (es. ! ? @ #) o 15 caratteri.");
  });

  it("stesse regole in tutti i punti dove si sceglie una password nuova", () => {
    const base = { email: "a@b.it", acceptedLegalTerms: true, declaredAdult: true, role: "CLIENT" as const };
    expect(registerSchema.safeParse({ ...base, password: "abcdefgh" }).success).toBe(false);
    expect(registerSchema.safeParse({ ...base, password: "abcdefg1!" }).success).toBe(true);
    expect(changePasswordSchema.safeParse({ newPassword: "abcdefgh" }).success).toBe(false);
    expect(passwordResetConfirmSchema.safeParse({ token: "x".repeat(32), password: "abcdefgh" }).success).toBe(false);
    expect(
      acceptProfileInviteSchema.safeParse({ token: "x".repeat(32), password: "abcdefgh", acceptedLegalTerms: true, declaredAdult: true }).success,
    ).toBe(false);
  });

  it("l'accesso accetta ancora le password create prima delle regole", () => {
    expect(emailPasswordSchema.safeParse({ email: "a@b.it", password: "abcdefgh" }).success).toBe(true);
  });
});
