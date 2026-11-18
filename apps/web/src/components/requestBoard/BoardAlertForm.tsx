"use client";

import { useState } from "react";
import { boardAlertSchema } from "@professionisti/shared";
import { apiClient } from "@/lib/apiClient";
import { TurnstileWidget } from "@/components/TurnstileWidget";
import styles from "./BoardPage.module.css";

/**
 * "Avvisami alla prima richiesta" sulla pagina mestiere + provincia vuota
 * (decisione di Luca, docs/changelog/2026-11-17-bacheca-rispondi.md): una
 * sola email, poi l'indirizzo si cancella. Nessun account.
 */
export function BoardAlertForm({
  trade,
  province,
  label,
  provinceName,
}: {
  trade: string;
  province: string;
  label: string;
  provinceName: string;
}) {
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "done">("idle");
  const [error, setError] = useState<string | null>(null);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileReset, setTurnstileReset] = useState(0);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    const parsed = boardAlertSchema.safeParse({
      email,
      trade,
      province,
      website,
      turnstileToken: turnstileToken ?? undefined,
    });
    if (!parsed.success) {
      setError("Scrivi un'email valida.");
      return;
    }
    setState("sending");
    try {
      await apiClient.addBoardAlert(parsed.data);
      setState("done");
    } catch {
      setState("idle");
      setError("Non è andata: riprova tra poco.");
      setTurnstileReset((value) => value + 1);
    }
  }

  if (state === "done") {
    return (
      <div className={styles.alert}>
        <p className={styles.alertDone} role="status">
          Fatto: ti scriviamo alla prima richiesta per {label} in provincia di{" "}
          {provinceName}.
        </p>
      </div>
    );
  }

  return (
    <form className={styles.alert} onSubmit={submit} noValidate>
      <p className={styles.alertTitle}>Avvisami alla prima richiesta</p>
      <p className={styles.boxText}>
        Ti mandiamo una sola email, poi cancelliamo il tuo indirizzo.
      </p>
      <div className={styles.alertRow}>
        <label htmlFor="board-alert-email" className="sr-only">
          La tua email
        </label>
        <input
          id="board-alert-email"
          className={styles.alertInput}
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="La tua email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "board-alert-error" : undefined}
        />
        <button
          type="submit"
          className={`${styles.cta} ${styles.ctaButton}`}
          disabled={state === "sending"}
        >
          {state === "sending" ? "Un momento…" : "Avvisami"}
        </button>
      </div>
      {/* Honeypot: invisibile alle persone. */}
      <input
        type="text"
        name="website"
        value={website}
        onChange={(event) => setWebsite(event.target.value)}
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        style={{ position: "absolute", left: "-10000px" }}
      />
      <TurnstileWidget
        onTokenChange={setTurnstileToken}
        resetSignal={turnstileReset}
      />
      {error ? (
        <p id="board-alert-error" className={styles.alertError} role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}
