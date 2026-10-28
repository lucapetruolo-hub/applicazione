"use client";

import { useEffect, useRef, useState } from "react";
import { EMAIL_CODE_LENGTH } from "@professionisti/shared";
import { Button, Icon, Text, XStack, YStack, brand } from "@professionisti/ui";
import { AuthField } from "@/components/AuthField";
import { apiClient } from "@/lib/apiClient";

type CheckState = "idle" | "checking" | "error" | "done";

/** Validità di un codice appena mandato, come `EMAIL_CODE_MINUTES` in apps/api. */
const CODE_VALID_SECONDS = 15 * 60;
/** Ogni quanto controllare se l'email è già stata confermata altrove (link sul telefono). */
const EMAIL_VERIFIED_POLL_MS = 3000;

/** Posta via web dei fornitori più usati, per aprirla con un tocco. */
function webmailFor(email: string): { label: string; url: string } | null {
  const domain = email.split("@")[1]?.toLowerCase() ?? "";
  if (domain === "gmail.com" || domain === "googlemail.com") return { label: "Apri Gmail", url: "https://mail.google.com/" };
  if (/^(outlook|hotmail|live|msn)\./.test(domain)) return { label: "Apri Outlook", url: "https://outlook.live.com/mail/" };
  if (/^yahoo\./.test(domain)) return { label: "Apri Yahoo Mail", url: "https://mail.yahoo.com/" };
  if (domain === "libero.it" || domain === "inwind.it" || domain === "iol.it" || domain === "blu.it") return { label: "Apri Libero Mail", url: "https://mail.libero.it/" };
  if (domain === "virgilio.it" || domain === "alice.it" || domain === "tim.it") return { label: "Apri la posta Virgilio", url: "https://mail.virgilio.it/" };
  if (domain === "icloud.com" || domain === "me.com" || domain === "mac.com") return { label: "Apri iCloud Mail", url: "https://www.icloud.com/mail" };
  return null;
}

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
 *
 * Con `linkFirst` (conferma email, docs/changelog/2026-10-28-verifica-email-con-link.md)
 * la cosa da fare è il pulsante nell'email: la pagina lo dice e si aggiorna
 * da sola quando si conferma, anche da un altro dispositivo. Le caselle del
 * codice restano di riserva dietro "Il pulsante non si apre?".
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
  linkFirst = false,
  initialLinkValidForSeconds,
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
  /** Riceve il nuovo indirizzo, che il genitore mostra al posto del vecchio (§251). */
  onEmailChanged?: (newEmail: string) => void;
  /** Controllo del codice diverso dalla conferma email (es. recupero password). */
  submitCode?: (code: string) => Promise<void>;
  /** Al posto del nuovo invio automatico: dove serve di nuovo il controllo anti-bot. */
  onRequestNewCode?: () => void;
  /** Inizio della frase sopra le caselle, seguito da "6 cifre a <email>". */
  intro?: string;
  doneLabel?: string;
  tip?: string;
  /** Prima il pulsante dell'email, il codice solo di riserva (conferma email). */
  linkFirst?: boolean;
  /** Secondi di validità del pulsante dell'email, da /auth/me. Assente: appena mandato. */
  initialLinkValidForSeconds?: number;
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
  // Con il pulsante in primo piano le caselle si aprono solo a richiesta.
  const [showCode, setShowCode] = useState(!linkFirst);
  const inputRef = useRef<HTMLInputElement>(null);
  const autoResent = useRef(false);
  const expired = validFor <= 0 && state !== "done";

  // Cursore già nel campo: il codice si scrive (o si incolla) subito.
  // Di nuovo dopo un codice sbagliato o dopo un codice nuovo, quando il
  // campo torna attivo.
  useEffect(() => {
    if (showCode && !expired && (state === "idle" || state === "error")) inputRef.current?.focus();
  }, [state, expired, showCode]);


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
  // Con il pulsante in primo piano conta la scadenza del pulsante (48 ore),
  // non quella del codice di riserva.
  const linkExpired = linkFirst && initialLinkValidForSeconds !== undefined && initialLinkValidForSeconds <= 0;
  useEffect(() => {
    if (autoResent.current || (linkFirst ? !linkExpired : validFor > 0) || resendIn > 0) return;
    autoResent.current = true;
    void resend(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Conferma fatta da un altro dispositivo (il link nella mail, aperto dal
  // telefono): la pagina lo vede da sola, senza ricaricarla. Solo per la
  // conferma email, non per il recupero password (che ha submitCode).
  const done = state === "done";
  useEffect(() => {
    if (submitCode || done) return;
    let stopped = false;
    const stop = () => {
      stopped = true;
      window.clearInterval(timer);
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", onVisible);
    };
    async function check() {
      try {
        const user = await apiClient.me(token);
        if (stopped || !user?.emailVerified) return;
        stop();
        setState("done");
        window.setTimeout(() => onVerified(user.email ?? email), 700);
      } catch {
        // Un controllo saltato per la rete non conta: si riprova tra poco.
      }
    }
    // Tornando sulla scheda (o sulla finestra) si controlla subito, senza
    // aspettare il prossimo giro.
    function onVisible() {
      if (document.visibilityState === "visible") void check();
    }
    const timer = window.setInterval(check, EMAIL_VERIFIED_POLL_MS);
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", onVisible);
    return stop;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, submitCode, done]);

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
      if (text.startsWith("Il codice è scaduto") || /troppe volte|finito i tentativi/.test(text)) setValidFor(0);
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
          {savingEmail ? "Invio..." : linkFirst ? "Manda l'email a questo indirizzo" : "Manda il codice a questa email"}
        </Button>
        <Button variant="ghost" onPress={() => setEditingEmail(false)}>
          Annulla
        </Button>
      </YStack>
    );
  }

  const webmail = linkFirst ? webmailFor(email) : null;
  const newLabel = linkFirst ? "una nuova email" : "un nuovo codice";
  const codeExpiredNow = expired && (!linkFirst || showCode);

  const codeBoxes = (
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
  );

  return (
    <YStack gap="$4">
      {linkFirst ? (
        <YStack gap="$3" alignItems="center">
          <Text fontSize={16} color={brand.grafite70} textAlign="center">
            Ti abbiamo mandato un&apos;email a<br />
            <Text fontWeight="700" color={brand.grafite}>
              {email}
            </Text>
          </Text>
          <Text fontSize={16} color={brand.grafite} textAlign="center">
            Aprila e premi <Text fontWeight="700">Conferma la mia email</Text>. Questa pagina si aggiorna da sola, anche se confermi dal telefono.
          </Text>
          {webmail && state !== "done" ? (
            <a className="email-webmail-link" href={webmail.url} target="_blank" rel="noopener noreferrer">
              <Icon name="mail" size={18} color={brand.cianografiaScuro} />
              {webmail.label}
            </a>
          ) : null}
        </YStack>
      ) : (
        <Text fontSize={16} color={brand.grafite70} textAlign="center">
          {intro} {EMAIL_CODE_LENGTH} cifre a<br />
          <Text fontWeight="700" color={brand.grafite}>
            {email}
          </Text>
        </Text>
      )}

      {showCode ? (
        <YStack gap="$2">
          {linkFirst ? (
            <Text fontSize={16} color={brand.grafite70} textAlign="center">
              Scrivi il codice di {EMAIL_CODE_LENGTH} cifre che trovi sotto il pulsante:
            </Text>
          ) : null}
          {codeBoxes}
        </YStack>
      ) : null}

      <div id="email-code-status" role="status" aria-live="polite" style={{ minHeight: linkFirst ? 0 : 22, textAlign: "center" }}>
        {state === "checking" ? (
          <Text fontSize={16} color={brand.grafite70}>
            Controllo il codice...
          </Text>
        ) : state === "done" ? (
          <XStack gap="$2" alignItems="center" justifyContent="center">
            <Icon name="check" size={18} color={brand.cianografiaScuro} strokeWidth={2.5} />
            <Text fontSize={16} fontWeight="700" color={brand.cianografiaScuro}>
              {doneLabel}
            </Text>
          </XStack>
        ) : resendState === "sending" && (linkFirst ? linkExpired : validFor <= 0) && autoResent.current ? (
          <Text fontSize={16} color={brand.grafite70}>
            {linkFirst ? "Il link di prima è scaduto: ti mandiamo una nuova email..." : "Il codice di prima è scaduto: te ne mandiamo uno nuovo..."}
          </Text>
        ) : message ? (
          <Text fontSize={16} color={brand.urgenza}>
            {message}
          </Text>
        ) : codeExpiredNow ? (
          <Text fontSize={16} color={brand.urgenza}>
            {linkFirst ? "Il codice è scaduto: chiedi una nuova email qui sotto, oppure usa il pulsante." : "Il codice è scaduto. Chiedine uno nuovo qui sotto."}
          </Text>
        ) : resendState === "renewed" ? (
          <Text fontSize={16} color={brand.cianografiaScuro} fontWeight="600">
            {linkFirst ? "Il link di prima era scaduto: ti abbiamo mandato una nuova email." : "Il codice di prima era scaduto: te ne abbiamo mandato uno nuovo."}
          </Text>
        ) : resendState === "sent" ? (
          <Text fontSize={16} color={brand.cianografiaScuro} fontWeight="600">
            {linkFirst ? "Nuova email inviata. Quella di prima non vale più." : "Nuovo codice inviato. Quello di prima non vale più."}
          </Text>
        ) : null}
      </div>

      <YStack gap="$2" alignItems="center">
        {/* La durata accanto al conto alla rovescia: senza, il minuto di
            attesa per un nuovo invio sembrava la scadenza del codice (§250). */}
        {/* Durata e nuovo invio in una riga sola (docs/CHANGELOG.md §278). */}
        {showCode && !expired && state !== "done" ? (
          <Text fontSize={16} color={brand.grafite70} textAlign="center">
            {linkFirst ? "Il codice vale" : "Vale"} ancora {validMinutes === 1 ? "1 minuto" : `${validMinutes} minuti`}
            {resendIn > 0 ? (
              <>
                {" · "}
                <Text fontSize={16} color={brand.grafite70} style={{ whiteSpace: "nowrap" }}>
                  {linkFirst ? "nuova email" : "nuovo codice"} tra {minutes}:{seconds}
                </Text>
              </>
            ) : null}
          </Text>
        ) : null}
        {state === "done" ? null : resendIn > 0 ? (
          codeExpiredNow || (linkFirst && !showCode) ? (
            <Text fontSize={16} color={brand.grafite70} textAlign="center">
              Puoi chiedere {newLabel} tra {minutes}:{seconds}
            </Text>
          ) : null
        ) : (
          <Button variant={codeExpiredNow && !linkFirst ? "primary" : "ghost"} onPress={() => void resend()} disabled={resendState === "sending"} opacity={resendState === "sending" ? 0.6 : 1}>
            {resendState === "sending" ? "Invio..." : linkFirst ? "Mandami una nuova email" : "Mandami un nuovo codice"}
          </Button>
        )}
        {resendError ? (
          <Text fontSize={16} color={brand.urgenza} textAlign="center">
            {resendError}
          </Text>
        ) : null}
        {linkFirst && !showCode && state !== "done" ? (
          <button type="button" className="link-button" onClick={() => setShowCode(true)}>
            Il pulsante non si apre? Usa il codice
          </button>
        ) : null}
        {allowChangeEmail && state !== "done" ? (
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

      <Text fontSize={13} color={brand.grafite70} textAlign="center">
        {linkFirst ? "Non la trovi? Guarda anche in Spam o Promozioni. Il pulsante vale 48 ore." : tip}
      </Text>
    </YStack>
  );
}
