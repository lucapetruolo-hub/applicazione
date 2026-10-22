"use client";

import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, PASSWORD_RULES } from "@professionisti/shared";

function RuleIcon({ state }: { state: "ok" | "missing" | "todo" }) {
  if (state === "ok") {
    return (
      <span className="pw-rule-icon" aria-hidden="true">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12l5 5 9-10" />
        </svg>
      </span>
    );
  }
  if (state === "missing") {
    return (
      <span className="pw-rule-icon" aria-hidden="true">
        <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </span>
    );
  }
  return <span className="pw-rule-icon" aria-hidden="true" />;
}

/**
 * Regole della password nuova sotto il campo (docs/CHANGELOG.md §289, sul
 * modello di Didit): grigie all'inizio, verdi con la spunta mentre si
 * scrive. Dopo un invio non riuscito (`showMissing`) quelle che mancano
 * diventano rosse con la ×, così non si capisce solo dal colore. Lo stato di
 * ogni regola è scritto anche per i lettori di schermo.
 */
export function PasswordRules({ password, showMissing = false, id }: { password: string; showMissing?: boolean; id?: string }) {
  return (
    <ul id={id} className="pw-rules">
      {PASSWORD_RULES.map((rule) => {
        const passed = rule.test(password);
        const state = passed ? "ok" : showMissing ? "missing" : "todo";
        return (
          <li key={rule.id} className={`pw-rule is-${state}`}>
            <RuleIcon state={state} />
            {rule.label}
            <span className="sr-only">{passed ? " (fatto)" : " (manca)"}</span>
          </li>
        );
      })}
    </ul>
  );
}

/** "Le password coincidono" sotto "Conferma password", appena sono uguali. */
export function PasswordMatchHint({ password, confirmPassword }: { password: string; confirmPassword: string }) {
  if (!password || password !== confirmPassword) return null;
  return (
    <ul className="pw-rules" aria-live="polite">
      <li className="pw-rule is-ok">
        <RuleIcon state="ok" />
        Le password coincidono
      </li>
    </ul>
  );
}

/**
 * Regole per il generatore di password di iPhone e Mac (attributo
 * `passwordrules`): la password suggerita rispetta le nostre al primo colpo.
 */
export const PASSWORD_RULES_ATTRIBUTE = `minlength: ${PASSWORD_MIN_LENGTH}; maxlength: ${PASSWORD_MAX_LENGTH}; required: lower; required: upper; required: digit; required: [-!?@#_.];`;
