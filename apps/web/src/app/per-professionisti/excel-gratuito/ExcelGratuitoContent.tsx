"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { BRAND, freeSpreadsheetSignupSchema } from "@professionisti/shared";
import { Icon, brand } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";
import { TURNSTILE_PENDING_MESSAGE, TurnstileWidget, isTurnstileEnabled } from "@/components/TurnstileWidget";

/**
 * Excel gratuito "Entrate e uscite" (docs/changelog/2026-11-19-entrate-e-uscite.md,
 * decisione di Luca del 19/11/2026: acceso già prima del lancio). L'email
 * riceve il link: è la conferma che l'indirizzo è suo. Dal link (?codice=)
 * il file si scarica. Il consenso alle novità è facoltativo e separato
 * (GDPR art. 7). Mai "senza commercialista": il foglio si dà al commercialista
 * (CLAUDE.md §5 punto 18).
 */
export function ExcelGratuitoContent() {
  const params = useSearchParams();
  const code = params.get("codice");
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileReset, setTurnstileReset] = useState(0);
  const [file, setFile] = useState<{ url: string | null; error: string | null } | null>(null);
  const asked = useRef(false);

  useEffect(() => {
    if (!code || asked.current) return;
    asked.current = true;
    apiClient
      .freeSpreadsheetConfirm(code)
      .then((r) => setFile({ url: r.fileUrl, error: null }))
      .catch((e: unknown) => setFile({ url: null, error: e instanceof Error ? e.message : "Il link non è più valido: chiedi di nuovo il file." }));
  }, [code]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    const parsed = freeSpreadsheetSignupSchema.safeParse({ email, marketingConsent: consent, turnstileToken: turnstileToken ?? undefined });
    if (!parsed.success) return setError("Scrivi un'email valida.");
    if (isTurnstileEnabled() && !turnstileToken) return setError(TURNSTILE_PENDING_MESSAGE);
    setState("sending");
    try {
      await apiClient.freeSpreadsheetSignup(parsed.data);
      setState("sent");
    } catch {
      setState("idle");
      setError("Non è andata: riprova tra poco.");
      setTurnstileReset((n) => n + 1);
    }
  }

  return (
    <main className={`xg-page${code ? " xg-page-download" : ""}`}>
      <div className="xg-wrap">
        <div className="xg-text">
          <p className="xg-eyebrow">Gratis per artigiani e professionisti</p>
          <h1>Entrate e uscite del tuo lavoro, in un Excel</h1>
          <p className="xg-lead">Scrivi i soldi che ricevi e le spese: il foglio calcola da solo i totali di ogni mese e quanto ti resta.</p>
          <ul className="xg-list">
            <li>
              <Icon name="check" size={18} color={brand.verificato} /> Entrate e uscite di ogni mese, già sommate
            </li>
            <li>
              <Icon name="check" size={18} color={brand.verificato} /> Spese divise per tipo: materiali, carburante, attrezzi, contributi
            </li>
            <li>
              <Icon name="check" size={18} color={brand.verificato} /> Stima dell&apos;imposta per il forfettario e avviso vicino agli 85.000 €
            </li>
            <li>
              <Icon name="check" size={18} color={brand.verificato} /> Si apre con Excel, Numbers e Google Fogli
            </li>
          </ul>
          <p className="xg-note">A fine anno dallo al tuo commercialista: le stime vanno sempre confermate con lui.</p>
        </div>

        <div className="xg-card">
          {code ? (
            file === null ? (
              <p role="status">Preparo il file…</p>
            ) : file.url ? (
              <div className="xg-done">
                <h2>Ecco il tuo Excel</h2>
                <a className="xg-button" href={file.url} download>
                  <Icon name="download" size={18} color="#ffffff" /> Scarica l&apos;Excel
                </a>
                <p>
                  Sei un professionista? Su {BRAND.name} questi conti si fanno da soli, con i lavori già dentro.{" "}
                  <Link href="/per-professionisti">Scopri come funziona</Link>
                </p>
              </div>
            ) : (
              <div>
                <p className="xg-error" role="alert">
                  {file.error}
                </p>
                <Link href="/per-professionisti/excel-gratuito">Chiedi di nuovo il file</Link>
              </div>
            )
          ) : state === "sent" ? (
            <div className="xg-done" role="status">
              <h2>Controlla la tua email</h2>
              <p>
                Ti abbiamo mandato il link per scaricare l&apos;Excel a <strong>{email.trim().toLowerCase()}</strong>. Se non lo vedi, guarda anche nella posta
                indesiderata.
              </p>
            </div>
          ) : (
            <form onSubmit={submit} noValidate>
              <h2>Ricevilo per email</h2>
              <label htmlFor="xg-email">La tua email</label>
              <input
                id="xg-email"
                type="email"
                inputMode="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nome@esempio.it"
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? "xg-error" : undefined}
              />
              <label className="xg-consent">
                <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
                <span>Mandatemi ogni tanto consigli e novità per il mio lavoro (facoltativo)</span>
              </label>
              <TurnstileWidget onTokenChange={setTurnstileToken} resetSignal={turnstileReset} />
              {error ? (
                <p id="xg-error" className="xg-error" role="alert">
                  {error}
                </p>
              ) : null}
              <button type="submit" className="xg-button" disabled={state === "sending"}>
                {state === "sending" ? "Un momento…" : "Mandamelo"}
              </button>
              <p className="xg-privacy">
                Usiamo la tua email solo per mandarti il file{consent ? " e, come hai scelto, le novità" : ""}. Dettagli nella <Link href="/privacy">Privacy</Link>.
              </p>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
