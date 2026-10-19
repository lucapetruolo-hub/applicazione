"use client";

import { useEffect, useRef, useState } from "react";
import { EMAIL_CODE_LENGTH } from "@professionisti/shared";
import { Button, Icon, Text, XStack, YStack, brand } from "@professionisti/ui";
import { AuthField } from "@/components/AuthField";
import { apiClient } from "@/lib/apiClient";

type CheckState = "idle" | "checking" | "error" | "done";

/** Validità di un codice appena mandato, come `EMAIL_CODE_MINUTES` in apps/api. */
const CODE_VALID_SECONDS = 15 * 60;

/**
 * Inserimento del codice di 6 cifre arrivato con l'email di conferma
 * (docs/CHANGELOG.md §243). Un solo `<input>` vero (incolla, riempimento
 * automatico da iPhone con `one-time-code`, tastiera numerica) sotto sei
 * caselle solo disegnate. Il codice parte da solo alla sesta cifra.
 *
 * Se il codice in corso è già scaduto (o non c'è) ne chiede subito uno nuovo,
 * e se scade mentre la pagina è aperta lo dice prima che si scriva.
 *
 * Usato dopo la registrazione del professionista, in /conferma-email, nel
 * riquadro facoltativo del cliente in /account e, con `submitCode` e
 * `onRequestNewCode`, in "Password dimenticata" (§245).
 */
export function EmailCodeForm({
  token,
  email,
  initialResendSeconds,
  initialValidForSeconds,
  onVerified,
  allowChangeEmail = false,
  onEmailChanged,
  submitCode,
  onRequestNewCode,
  intro = "Abbiamo mandato un codice di",
  doneLabel = "Email confermata",
  tip = "Non la trovi? Guarda anche in Spam o Promozioni. Nella stessa email c'è anche un pulsante che conferma con un tocco.",
}: {
  token: string;
  email: string;
  /** Secondi prima di poter chiedere un nuovo codice, come li dà /auth/me. */
  initialResendSeconds: number;
  /** Secondi di validità del codice in corso, da /auth/me. Assente: appena mandato. */
  initialValidForSeconds?: number;
  onVerified: (email: string) => void;
  /** Solo dove cambiare l'email manda subito un nuovo codice (account professionista). */
  allowChangeEmail?: boolean;
  /** Riceve il nuovo indirizzo, che il genitore mostra al posto del vecchio (§247). */
  onEmailChanged?: (newEmail: string) => void;
  /** Controllo del codice diverso dalla conferma email (es. recupero password). */
  submitCode?: (code: string) => Promise<void>;
  /** Al posto del nuovo invio automatico: dove serve di nuovo il controllo anti-bot. */
  onRequestNewCode?: () => void;
  /** Inizio della frase sopra le caselle, seguito da "6 cifre a <email>". */
  intro?: string;
  doneLabel?: string;
  tip?: string;
}) {
  const [code, setCode] = useState("");
  const [state, setState] = useState<CheckState>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  const [resendIn, setResendIn] = useState(initialResendSeconds);
  const [validFor, setValidFor] = useState(initialValidForSeconds ?? CODE_VALID_SECONDS);
  const [resendState, setResendState] = useState<"idle" | "sending" | "sent" | "renewed">("idle");
  const [resendError, setResendError] = useState<string | null>(null);
  const [editingEmail, setEditingEmail] = useState(false);
  const [newEmail, setNewEmail] = useState(email);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [savingEmail, setSavingEmail] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const autoResent = useRef(false);
  const expired = validFor <= 0 && state !== "done";

  // Cursore già nel campo: il codice si scrive (o si incolla) subito.
  // Di nuovo dopo un codice sbagliato o dopo un codice nuovo, quando il
  // campo torna attivo.
  useEffect(() => {
    if (!expired && (state === "idle" || state === "error")) inputRef.current?.focus();
  }, [state, expired]);


  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = window.setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [resendIn]);

  useEffect(() => {
    if (validFor <= 0) return;
    const timer = window.setTimeout(() => setValidFor((s) => s - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [validFor]);

  // Codice già scaduto all'arrivo (email vecchia, tentativi finiti): invece
  // di far scrivere un codice che non può funzionare, ne mandiamo subito uno
  // nuovo. Una volta sola, e solo se l'attesa tra due invii è passata.
  useEffect(() => {
    if (autoResent.current || validFor > 0 || resendIn > 0) return;
    autoResent.current = true;
    void resend(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submit(value: string) {
    if (value.length !== EMAIL_CODE_LENGTH || state === "checking" || state === "done") return;
    setState("checking");
    setMessage(null);
    try {
      let confirmedEmail = email;
      if (submitCode) await submitCode(value);
      else confirmedEmail = (await apiClient.verifyEmailCode(token, value)).email;
      setState("done");
      // Un attimo per vedere la spunta verde prima di andare avanti.
      window.setTimeout(() => onVerified(confirmedEmail), 700);
    } catch (err) {
      const text = err instanceof Error ? err.message : "Non siamo riusciti a controllare il codice, riprova.";
      // Scaduto o tentativi finiti: si può solo chiederne uno nuovo.
      if (/^Il codice è scaduto|troppe volte|finito i tentativi/.test(text)) setValidFor(0);
      setState("error");
      setMessage(text);
      setCode("");
    }
  }

  function onChange(raw: string) {
    const digits = raw.replace(/\D/g, "").slice(0, EMAIL_CODE_LENGTH);
    setCode(digits);
    if (state === "error") setState("idle");
    if (digits.length === EMAIL_CODE_LENGTH) void submit(digits);
  }

  async function resend(afterExpiry = false) {
    if (onRequestNewCode) {
      onRequestNewCode();
      return;
    }
    setResendState("sending");
    setResendError(null);
    try {
      await apiClient.resendVerificationEmail(token);
      setResendState(afterExpiry ? "renewed" : "sent");
      setResendIn(60);
      setValidFor(CODE_VALID_SECONDS);
      setCode("");
      setState("idle");
      setMessage(null);
      inputRef.current?.focus();
    } catch (err) {
      setResendState("idle");
      setResendError(err instanceof Error ? err.message : "Invio non riuscito, riprova tra poco.");
    }
  }

  async function saveEmail() {
    const next = newEmail.trim();
    if (!/^\S+@\S+\.\S+$/.test(next)) {
      setEmailError("Scrivi un indirizzo email valido, ad esempio nome@esempio.it.");
      return;
    }
    if (next.toLowerCase() === email.toLowerCase()) {
      setEditingEmail(false);
      return;
    }
    setSavingEmail(true);
    setEmailError(null);
    try {
      await apiClient.updateAccount(token, { email: next });
      setEditingEmail(false);
      setResendIn(60);
      setValidFor(CODE_VALID_SECONDS);
      setResendState("sent");
      setCode("");
      setState("idle");
      setMessage(null);
      onEmailChanged?.(next);
    } catch (err) {
      setEmailError(err instanceof Error ? err.message : "Non siamo riusciti a cambiare l'email, riprova.");
    } finally {
      setSavingEmail(false);
    }
  }

  const validMinutes = Math.max(1, Math.ceil(validFor / 60));
  const minutes = Math.floor(resendIn / 60);
  const seconds = String(resendIn % 60).padStart(2, "0");
  const boxesClass = `email-code-boxes${expired ? " is-expired" : ""}${state === "error" ? " is-error" : ""}${state === "done" ? " is-done" : ""}`;

  if (editingEmail) {
    return (
      <YStack gap="$4">
        <AuthField
          label="Email corretta"
          value={newEmail}
          onChangeText={(value) => {
            setNewEmail(value);
            setEmailError(null);
          }}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          nativeID="email-corretta"
          error={emailError ?? undefined}
          onSubmitEditing={saveEmail}
        />
        <Button variant="primary" onPress={saveEmail} disabled={savingEmail} opacity={savingEmail ? 0.6 : 1}>
          {savingEmail ? "Invio del codice..." : "Manda il codice a questa email"}
        </Button>
        <Button variant="ghost" onPress={() => setEditingEmail(false)}>
          Annulla
        </Button>
      </YStack>
    );
  }

  return (
    <YStack gap="$4">
      <Text fontSize="$4" color={brand.grafite70} textAlign="center">
        {intro} {EMAIL_CODE_LENGTH} cifre a<br />
        <Text fontWeight="700" color={brand.grafite}>
          {email}
        </Text>
      </Text>

      <div className="email-code">
        <input
          ref={inputRef}
          className="email-code-input"
          value={code}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="one-time-code"
          maxLength={EMAIL_CODE_LENGTH + 2}
          aria-label={`Codice di ${EMAIL_CODE_LENGTH} cifre`}
          aria-invalid={state === "error" ? true : undefined}
          aria-describedby="email-code-status"
          disabled={state === "checking" || state === "done" || expired}
        />
        <div className={boxesClass} aria-hidden="true">
          {Array.from({ length: EMAIL_CODE_LENGTH }, (_, i) => (
            <span
              key={i}
              className={`email-code-box${code[i] ? " is-filled" : ""}${focused && !expired && i === Math.min(code.length, EMAIL_CODE_LENGTH - 1) && state === "idle" ? " is-active" : ""}`}
            >
              {code[i] ?? ""}
            </span>
          ))}
        </div>
      </div>

      <div id="email-code-status" role="status" aria-live="polite" style={{ minHeight: 22, textAlign: "center" }}>
        {state === "checking" ? (
          <Text fontSize="$3" color={brand.grafite70}>
            Controllo il codice...
          </Text>
        ) : state === "done" ? (
          <XStack gap="$2" alignItems="center" justifyContent="center">
            <Icon name="check" size={18} color={brand.cianografiaScuro} strokeWidth={2.5} />
            <Text fontSize="$3" fontWeight="700" color={brand.cianografiaScuro}>
              {doneLabel}
            </Text>
          </XStack>
        ) : resendState === "sending" && validFor <= 0 ? (
          <Text fontSize="$3" color={brand.grafite70}>
            Il codice di prima è scaduto: te ne mandiamo uno nuovo...
          </Text>
        ) : message ? (
          <Text fontSize="$3" color={brand.urgenza}>
            {message}
          </Text>
        ) : expired ? (
          <Text fontSize="$3" color={brand.urgenza}>
            Il codice è scaduto. Chiedine uno nuovo qui sotto.
          </Text>
        ) : resendState === "renewed" ? (
          <Text fontSize="$3" color={brand.cianografiaScuro} fontWeight="600">
            Il codice di prima era scaduto: te ne abbiamo mandato uno nuovo.
          </Text>
        ) : resendState === "sent" ? (
          <Text fontSize="$3" color={brand.cianografiaScuro} fontWeight="600">
            Nuovo codice inviato. Quello di prima non vale più.
          </Text>
        ) : null}
      </div>

      <YStack gap="$2" alignItems="center">
        {/* La durata accanto al conto alla rovescia: senza, il minuto di
            attesa per un nuovo invio sembrava la scadenza del codice (§246). */}
        {!expired && state !== "done" ? (
          <Text fontSize="$3" color={brand.grafite70} textAlign="center">
            Il codice vale ancora {validMinutes === 1 ? "1 minuto" : `${validMinutes} minuti`}.
          </Text>
        ) : null}
        {resendIn > 0 ? (
          <Text fontSize="$3" color={brand.grafite70} textAlign="center">
            Non arriva? Puoi chiederne un altro tra {minutes}:{seconds}
          </Text>
        ) : (
          <Button variant={expired ? "primary" : "ghost"} onPress={() => void resend()} disabled={resendState === "sending"} opacity={resendState === "sending" ? 0.6 : 1}>
            {resendState === "sending" ? "Invio..." : "Mandami un nuovo codice"}
          </Button>
        )}
        {resendError ? (
          <Text fontSize="$3" color={brand.urgenza} textAlign="center">
            {resendError}
          </Text>
        ) : null}
        {allowChangeEmail ? (
          <button
            type="button"
            className="link-button"
            onClick={() => {
              setNewEmail(email);
              setEditingEmail(true);
            }}
          >
            Email sbagliata? Correggila
          </button>
        ) : null}
      </YStack>

      <Text fontSize="$2" color={brand.grafite70} textAlign="center">
        {tip}
      </Text>
    </YStack>
  );
}
