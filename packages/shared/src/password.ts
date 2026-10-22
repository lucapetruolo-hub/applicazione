import { z } from "zod";

/**
 * Regole della password nuova (docs/CHANGELOG.md §280, richiesta dell'utente
 * sul modello di Didit): mostrate sotto il campo, diventano verdi mentre si
 * scrive. Le stesse regole valgono nel browser e nell'API. L'accesso non le
 * controlla: chi ha già una password più semplice entra lo stesso.
 */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 64;
// bcrypt ignora tutto quello che va oltre i 72 byte: con lettere accentate o
// emoji 64 caratteri possono superarli.
const PASSWORD_MAX_BYTES = 72;

export type PasswordRule = { id: "length" | "number" | "symbol"; label: string; test: (password: string) => boolean };

export const PASSWORD_RULES: readonly PasswordRule[] = [
  { id: "length", label: `Almeno ${PASSWORD_MIN_LENGTH} caratteri`, test: (p) => [...p].length >= PASSWORD_MIN_LENGTH },
  { id: "number", label: "Almeno un numero", test: (p) => /\p{N}/u.test(p) },
  { id: "symbol", label: "Almeno un simbolo (es. ! ? @ #)", test: (p) => /[^\p{L}\p{N}\s]/u.test(p) },
];

/** Primo messaggio d'errore della password, o null se va bene. */
export function passwordProblem(password: string): string | null {
  if ([...password].length > PASSWORD_MAX_LENGTH || new TextEncoder().encode(password).length > PASSWORD_MAX_BYTES) {
    return `La password può avere al massimo ${PASSWORD_MAX_LENGTH} caratteri.`;
  }
  const missing = PASSWORD_RULES.filter((rule) => !rule.test(password));
  if (missing.length === 0) return null;
  return `La password deve avere: ${missing.map((rule) => rule.label.toLowerCase()).join(", ")}.`;
}

/** Password nuova: registrazione, link d'invito, recupero e cambio password. */
export const newPasswordSchema = z.string().superRefine((password, ctx) => {
  const problem = passwordProblem(password);
  if (problem) ctx.addIssue({ code: z.ZodIssueCode.custom, message: problem });
});

/** Messaggio dell'API quando la password è tra quelle rubate in passato. */
export const PWNED_PASSWORD_MESSAGE = "Questa password è stata rubata in passato da altri siti: scegline un'altra.";
