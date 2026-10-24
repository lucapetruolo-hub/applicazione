import { z } from "./zod";

/**
 * Regole della password nuova (docs/CHANGELOG.md §289, richiesta dell'utente
 * sul modello di Didit): mostrate sotto il campo, diventano verdi mentre si
 * scrive. Le stesse regole valgono nel browser e nell'API. L'accesso non le
 * controlla: chi ha già una password più semplice entra lo stesso. Niente
 * simbolo obbligatorio (decisione dell'utente): le password suggerite da
 * Google non ne hanno.
 */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 64;
// bcrypt ignora tutto quello che va oltre i 72 byte: con lettere accentate o
// emoji 64 caratteri possono superarli.
const PASSWORD_MAX_BYTES = 72;
// Una parte dell'email più corta di così ("ab@...") compare per caso in troppe password.
const EMAIL_PART_MIN_LENGTH = 4;

export type PasswordRule = { id: "length" | "number"; label: string; test: (password: string) => boolean };

export const PASSWORD_RULES: readonly PasswordRule[] = [
  { id: "length", label: `Almeno ${PASSWORD_MIN_LENGTH} caratteri`, test: (p) => [...p].length >= PASSWORD_MIN_LENGTH },
  { id: "number", label: "Almeno un numero", test: (p) => /\p{N}/u.test(p) },
];

export const PASSWORD_CONTAINS_EMAIL_MESSAGE = "La password non può contenere la tua email.";

/**
 * Vero se la password contiene l'email o la parte prima della chiocciola
 * (OWASP ASVS 6.2.11), senza badare a maiuscole e minuscole.
 */
export function passwordContainsEmail(password: string, email: string | null | undefined): boolean {
  const address = email?.trim().toLowerCase();
  if (!address) return false;
  const local = address.split("@")[0] ?? "";
  const lower = password.toLowerCase();
  return lower.includes(address) || (local.length >= EMAIL_PART_MIN_LENGTH && lower.includes(local));
}

const MISSING_RULES_PREFIX = "La password deve avere: ";

/** Vero se il messaggio elenca regole mancanti, già mostrate in rosso sotto il campo. */
export function isMissingRulesProblem(problem: string): boolean {
  return problem.startsWith(MISSING_RULES_PREFIX);
}

/** Primo messaggio d'errore della password, o null se va bene. */
export function passwordProblem(password: string, email?: string | null): string | null {
  if ([...password].length > PASSWORD_MAX_LENGTH || new TextEncoder().encode(password).length > PASSWORD_MAX_BYTES) {
    return `La password può avere al massimo ${PASSWORD_MAX_LENGTH} caratteri.`;
  }
  const missing = PASSWORD_RULES.filter((rule) => !rule.test(password));
  if (missing.length > 0) {
    return `${MISSING_RULES_PREFIX}${missing.map((rule) => rule.label.toLowerCase()).join(", ")}.`;
  }
  if (passwordContainsEmail(password, email)) return PASSWORD_CONTAINS_EMAIL_MESSAGE;
  return null;
}

/** Password nuova: registrazione, link d'invito, recupero e cambio password. */
export const newPasswordSchema = z.string().superRefine((password, ctx) => {
  const problem = passwordProblem(password);
  if (problem) ctx.addIssue({ code: "custom", message: problem });
});
