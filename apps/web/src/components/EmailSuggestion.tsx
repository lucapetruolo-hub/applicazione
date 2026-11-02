"use client";

import { suggestEmailCorrection } from "@professionisti/shared";

/**
 * "Forse intendevi mario@gmail.com?" sotto il campo email, dopo che si è
 * usciti dal campo: un tocco corregge l'indirizzo. Non blocca mai l'invio
 * (docs/changelog/2026-11-02-registrazione-pro-migliorie.md).
 */
export function EmailSuggestion({ id, email, checked, onApply }: { id: string; email: string; checked: boolean; onApply: (next: string) => void }) {
  const suggestion = checked ? suggestEmailCorrection(email) : null;
  // Sempre presente (anche vuoto) perché il campo lo legge con aria-describedby.
  return (
    <p id={id} className="email-suggestion" aria-live="polite">
      {suggestion ? (
        <>
          Forse intendevi{" "}
          <button type="button" className="link-button email-suggestion-apply" onClick={() => onApply(suggestion)}>
            {suggestion}
          </button>
          ?
        </>
      ) : null}
    </p>
  );
}
