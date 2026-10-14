"use client";

import { useEffect, useRef, useState } from "react";
import { EMAIL_CODE_LENGTH } from "@professionisti/shared";
import { Button, Icon, Text, XStack, YStack, brand } from "@professionisti/ui";
import { AuthField } from "@/components/AuthField";
import { apiClient } from "@/lib/apiClient";

type CheckState = "idle" | "checking" | "error" | "done";

/**
 * Inserimento del codice di 6 cifre arrivato con l'email di conferma
 * (docs/CHANGELOG.md §243). Un solo `<input>` vero (incolla, riempimento
 * automatico da iPhone con `one-time-code`, tastiera numerica) sotto sei
 * caselle solo disegnate. Il codice parte da solo alla sesta cifra.
 *
 * Usato dopo la registrazione del professionista, in /conferma-email e nel
 * riquadro facoltativo del cliente in /account.
 */
export function EmailCodeForm({
  token,
  email,
  initialResendSeconds,
  onVerified,
  allowChangeEmail = false,
  onEmailChanged,
}: {
  token: string;
  email: string;
  /** Secondi prima di poter chiedere un nuovo codice, come li dà /auth/me. */
  initialResendSeconds: number;
  onVerified: (email: string) => void;
  /** Solo dove cambiare l'email manda subito un nuovo codice (account professionista). */
  allowChangeEmail?: boolean;
  onEmailChanged?: () => void;
}) {
  const [code, setCode] = useState("");
  const [state, setState] = useState<CheckState>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  const [resendIn, setResendIn] = useState(initialResendSeconds);
  const [resendState, setResendState] = useState<"idle" | "sending" | "sent">("idle");
  const [resendError, setResendError] = useState<string | null>(null);
  const [editingEmail, setEditingEmail] = useState(false);
  const [newEmail, setNewEmail] = useState(email);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [savingEmail, setSavingEmail] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Cursore già nel campo: il codice si scrive (o si incolla) subito.
  // Di nuovo dopo un codice sbagliato, quando il campo torna attivo.
  useEffect(() => {
    if (state === "idle" || state === "error") inputRef.current?.focus();
  }, [state]);

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = window.setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [resendIn]);

  async function submit(value: string) {
    if (value.length !== EMAIL_CODE_LENGTH || state === "checking" || state === "done") return;
    setState("checking");
    setMessage(null);
    try {
      const result = await apiClient.verifyEmailCode(token, value);
      setState("done");
      // Un attimo per vedere la spunta verde prima di andare avanti.
      window.setTimeout(() => onVerified(result.email), 700);
    } catch (err) {
      setState("error");
      setMessage(err instanceof Error ? err.message : "Non siamo riusciti a controllare il codice, riprova.");
      setCode("");
    }
  }

  function onChange(raw: string) {
    const digits = raw.replace(/\D/g, "").slice(0, EMAIL_CODE_LENGTH);
    setCode(digits);
    if (state === "error") setState("idle");
    if (digits.length === EMAIL_CODE_LENGTH) void submit(digits);
  }

  async function resend() {
    setResendState("sending");
    setResendError(null);
    try {
      await apiClient.resendVerificationEmail(token);
      setResendState("sent");
      setResendIn(60);
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
      setResendState("sent");
      setCode("");
      setState("idle");
      setMessage(null);
      onEmailChanged?.();
    } catch (err) {
      setEmailError(err instanceof Error ? err.message : "Non siamo riusciti a cambiare l'email, riprova.");
    } finally {
      setSavingEmail(false);
    }
  }

  const minutes = Math.floor(resendIn / 60);
  const seconds = String(resendIn % 60).padStart(2, "0");
  const boxesClass = `email-code-boxes${state === "error" ? " is-error" : ""}${state === "done" ? " is-done" : ""}`;

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
        Abbiamo mandato un codice di {EMAIL_CODE_LENGTH} cifre a<br />
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
          disabled={state === "checking" || state === "done"}
        />
        <div className={boxesClass} aria-hidden="true">
          {Array.from({ length: EMAIL_CODE_LENGTH }, (_, i) => (
            <span
              key={i}
              className={`email-code-box${code[i] ? " is-filled" : ""}${focused && i === Math.min(code.length, EMAIL_CODE_LENGTH - 1) && state === "idle" ? " is-active" : ""}`}
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
              Email confermata
            </Text>
          </XStack>
        ) : message ? (
          <Text fontSize="$3" color={brand.urgenza}>
            {message}
          </Text>
        ) : resendState === "sent" ? (
          <Text fontSize="$3" color={brand.cianografiaScuro} fontWeight="600">
            Nuovo codice inviato. Quello di prima non vale più.
          </Text>
        ) : null}
      </div>

      <YStack gap="$2" alignItems="center">
        {resendIn > 0 ? (
          <Text fontSize="$3" color={brand.grafite70}>
            Puoi chiedere un nuovo codice tra {minutes}:{seconds}
          </Text>
        ) : (
          <Button variant="ghost" onPress={resend} disabled={resendState === "sending"} opacity={resendState === "sending" ? 0.6 : 1}>
            {resendState === "sending" ? "Invio..." : "Mandami un nuovo codice"}
          </Button>
        )}
        {resendError ? (
          <Text fontSize="$3" color={brand.urgenza} textAlign="center">
            {resendError}
          </Text>
        ) : null}
        {allowChangeEmail ? (
          <Button
            variant="ghost"
            onPress={() => {
              setNewEmail(email);
              setEditingEmail(true);
            }}
          >
            Email sbagliata? Correggila
          </Button>
        ) : null}
      </YStack>

      <Text fontSize="$2" color={brand.grafite70} textAlign="center">
        Non la trovi? Guarda anche in Spam o Promozioni. Nella stessa email c&apos;è anche un pulsante che conferma con un tocco.
      </Text>
    </YStack>
  );
}
