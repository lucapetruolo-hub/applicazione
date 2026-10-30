"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { PASSWORD_CONTAINS_EMAIL_MESSAGE, emailStatusSchema, isMissingRulesProblem, passwordProblem, type EmailStatus } from "@professionisti/shared";
import { Button, Text, XStack, YStack, brand } from "@professionisti/ui";
import { AuthField } from "@/components/AuthField";
import { GoogleSignInButton } from "@/components/GoogleSignInButton";
import { PASSWORD_RULES_ATTRIBUTE, PasswordMatchHint, PasswordRules } from "@/components/PasswordRules";
import { TURNSTILE_PENDING_MESSAGE, TurnstileWidget, isTurnstileEnabled } from "@/components/TurnstileWidget";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/lib/AuthContext";
import { PasswordVisibilityToggle } from "@/components/PasswordVisibilityToggle";

type Step = "email" | EmailStatus;

const linkStyle = { textDecoration: "underline", color: brand.cianografiaScuro } as const;

/**
 * Dicitura legale al posto delle due caselle (docs/CHANGELOG.md §176, sul
 * modello di MioDottore): l'informativa privacy si legge, non si "accetta".
 * Il click sul pulsante vale come accettazione dei Termini e dichiarazione
 * dei 18 anni, registrate come prima (`legalConsentAt`/`legalConsentVersion`).
 */
function LegalNotice({ action }: { action: string }) {
  return (
    <Text fontSize={13} lineHeight={18} color={brand.grafite70} textAlign="center">
      {action} accetti i nostri{" "}
      <Link href="/termini" target="_blank" style={linkStyle}>
        Termini di Servizio
      </Link>
      , confermi di aver letto e compreso la nostra{" "}
      <Link href="/privacy" target="_blank" style={linkStyle}>
        Privacy Policy
      </Link>{" "}
      e di avere almeno 18 anni.
    </Text>
  );
}

function EmailPill({ email, onEdit }: { email: string; onEdit: () => void }) {
  return (
    <XStack alignItems="center" justifyContent="space-between" gap="$3" backgroundColor={brand.gesso} borderRadius={999} paddingHorizontal="$4" paddingVertical="$2">
      <Text fontSize={16} color={brand.grafite} numberOfLines={1} flexShrink={1}>
        {email}
      </Text>
      <Text fontSize={16} fontWeight="600" color={brand.cianografiaScuro} cursor="pointer" onPress={onEdit} accessibilityRole="button">
        Modifica
      </Text>
    </XStack>
  );
}


export type ClientEmailFirstAuthTitles = Record<Step, { eyebrow: string; title: string }>;

/**
 * Accesso e registrazione del cliente "prima l'email" (docs/CHANGELOG.md
 * §176, scelta dell'utente sul modello di MioDottore): si scrive solo
 * l'email, il sito capisce se l'account esiste (`/auth/email-status`) e
 * chiede la password, ne fa scegliere una nuova o rimanda a Google. Niente
 * caselle: vale la dicitura sotto il pulsante, anche per Google, quindi
 * niente popup di consenso dopo Google. Un account nuovo chiede la password
 * due volte (docs/CHANGELOG.md §193, richiesta dell'utente).
 * Usato dal popup della richiesta (InlineAuthGate) e da /registrati?ruolo=cliente.
 */
export function ClientEmailFirstAuth({
  renderHeader,
  intro,
  firstTimeNote,
  submitSuffix,
  onAuthenticated,
}: {
  /** Intestazione del passo corrente (titolo, eventuale pulsante di chiusura).
   * `back` c'è dopo l'email: torna al campo email (docs/CHANGELOG.md §278). */
  renderHeader: (step: Step, back?: () => void) => ReactNode;
  intro: string;
  firstTimeNote?: string;
  /** Es. " e invia la richiesta": completa "Crea account"/"Accedi". */
  submitSuffix: string;
  onAuthenticated: (isNewUser: boolean) => void;
}) {
  const { login } = useAuth();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  // Account nuovo: regole della password rosse dopo un invio non riuscito (§289).
  const [passwordAttempted, setPasswordAttempted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Campo a cui si riferisce l'errore: il messaggio va sotto quel campo
  // (docs/CHANGELOG.md §278). Nullo: errore generale, sopra il pulsante.
  const [errorField, setErrorField] = useState<"email" | "password" | "confirm" | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileReset, setTurnstileReset] = useState(0);

  function editEmail() {
    setStep("email");
    setPassword("");
    setConfirmPassword("");
    setPasswordAttempted(false);
    setError(null);
    setErrorField(null);
    setTurnstileToken(null);
  }

  function fieldError(field: "email" | "password" | "confirm", message: string, inputId: string) {
    setError(message);
    setErrorField(field);
    document.getElementById(inputId)?.focus();
  }

  async function run(action: () => Promise<void>) {
    setError(null);
    setErrorField(null);
    setIsSubmitting(true);
    try {
      await action();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Errore imprevisto, riprova.";
      if (message === PASSWORD_CONTAINS_EMAIL_MESSAGE) fieldError("password", message, "new-password");
      else setError(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleContinue() {
    const parsed = emailStatusSchema.safeParse({ email: email.trim() });
    if (!parsed.success) {
      fieldError("email", parsed.error.issues[0]?.message ?? "Email non valida", "email");
      return;
    }
    void run(async () => {
      const { status } = await apiClient.emailStatus(parsed.data.email);
      setEmail(parsed.data.email);
      setStep(status);
    });
  }

  function handlePassword() {
    // Password nuova: le regole sotto il campo dicono cosa manca (§289).
    const problem = step === "new" ? passwordProblem(password, email) : null;
    if (problem) {
      setPasswordAttempted(true);
      fieldError("password", isMissingRulesProblem(problem) ? "" : problem, "new-password");
      return;
    }
    // Accesso: le password create prima delle regole hanno almeno 8 caratteri.
    if (step !== "new" && password.length < 8) {
      fieldError("password", "La password deve avere almeno 8 caratteri", "current-password");
      return;
    }
    if (step === "new" && password !== confirmPassword) {
      fieldError("confirm", "Le due password non coincidono", "confirm-password");
      return;
    }
    if (step === "new" && isTurnstileEnabled() && !turnstileToken) {
      setError(TURNSTILE_PENDING_MESSAGE);
      return;
    }
    void run(async () => {
      try {
        const { token, isNewUser } =
          step === "new"
            ? await apiClient.register(email, password, undefined, "CLIENT", true, true, turnstileToken ?? undefined)
            : await apiClient.login(email, password);
        await login(token);
        onAuthenticated(isNewUser);
      } catch (err) {
        // Il token anti-bot vale una volta sola: ne serve uno nuovo per riprovare.
        if (step === "new") setTurnstileReset((n) => n + 1);
        throw err;
      }
    });
  }

  function handleGoogle(idToken: string) {
    // La dicitura sotto il pulsante vale anche per Google: consenso inviato
    // insieme, il server lo registra solo se crea davvero l'account.
    void run(async () => {
      const { token, isNewUser } = await apiClient.verifyGoogle(idToken, "CLIENT", true, true, true);
      await login(token);
      onAuthenticated(isNewUser);
    });
  }

  const errorText =
    error && !errorField ? (
      <Text role="alert" color={brand.urgenza} fontSize={16}>
        {error}
      </Text>
    ) : null;
  const errorFor = (field: "email" | "password" | "confirm") => (error && errorField === field ? error : undefined);

  if (step === "email") {
    return (
      <YStack gap="$4">
        {renderHeader(step)}
        <Text fontSize={16} color={brand.grafite70}>
          {intro}
        </Text>
        <GoogleSignInButton onCredential={handleGoogle} disabled={isSubmitting} />
        {process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ? (
          <XStack alignItems="center" gap="$3">
            <YStack flex={1} height={1} backgroundColor={brand.filetto} />
            <Text fontFamily="$body" fontWeight="700" fontSize={13} color={brand.grafite70}>
              oppure
            </Text>
            <YStack flex={1} height={1} backgroundColor={brand.filetto} />
          </XStack>
        ) : null}
        <form onSubmit={(e) => e.preventDefault()}>
          <YStack gap="$4">
            <AuthField
              label="Email"
              value={email}
              placeholder="nome@esempio.it"
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="username"
              nativeID="email"
              accessibilityLabel="Email"
              error={errorFor("email")}
              onChangeText={(value) => {
                setEmail(value);
                if (errorField === "email") setError(null);
              }}
              onSubmitEditing={handleContinue}
            />
            {errorText}
            <Button variant="primary" onPress={handleContinue} disabled={isSubmitting} opacity={isSubmitting ? 0.6 : 1}>
              {isSubmitting ? "Un momento..." : "Continua"}
            </Button>
          </YStack>
        </form>
        <LegalNotice action="Continuando" />
        {firstTimeNote ? (
          <Text fontSize={13} lineHeight={18} color={brand.grafite70} textAlign="center">
            {firstTimeNote}
          </Text>
        ) : null}
      </YStack>
    );
  }

  if (step === "google") {
    return (
      <YStack gap="$4">
        {renderHeader(step, editEmail)}
        <EmailPill email={email} onEdit={editEmail} />
        <Text fontSize={16} color={brand.grafite70}>
          Questo account è collegato a Google: accedi con lo stesso indirizzo.
        </Text>
        <GoogleSignInButton onCredential={handleGoogle} disabled={isSubmitting} />
        {errorText}
      </YStack>
    );
  }

  const isNew = step === "new";
  return (
    <YStack gap="$4">
      {renderHeader(step, editEmail)}
      <EmailPill email={email} onEdit={editEmail} />
      <Text fontSize={16} color={brand.grafite70}>
        {isNew
          ? "Scegli una password per il nuovo account."
          : "Hai già un account: inserisci la password."}
      </Text>
      <form onSubmit={(e) => e.preventDefault()}>
        <YStack gap="$4">
          {/* Email nascosta accanto alla password: i gestori di password la
              salvano insieme (stesso motivo dell'autoComplete in /registrati). */}
          <input type="email" name="email" autoComplete="username" value={email} readOnly hidden />
          <AuthField
            label={isNew ? "Scegli una password" : "Password"}
            rightElement={<PasswordVisibilityToggle visible={showPassword} onToggle={() => setShowPassword((v) => !v)} />}
            value={password}
            onChangeText={setPassword}
            placeholder="Password"
            secureTextEntry={!showPassword}
            autoComplete={isNew ? "new-password" : "current-password"}
            nativeID={isNew ? "new-password" : "current-password"}
            accessibilityLabel="Password"
            error={errorFor("password")}
            passwordRules={isNew ? PASSWORD_RULES_ATTRIBUTE : undefined}
            invalid={isNew && passwordAttempted && passwordProblem(password, email) !== null}
            footer={isNew ? <PasswordRules id="new-password-rules" password={password} showMissing={passwordAttempted} /> : undefined}
            footerId={isNew ? "new-password-rules" : undefined}
            onSubmitEditing={handlePassword}
          />
          {isNew ? (
            <AuthField
              label="Conferma password"
              rightElement={<PasswordVisibilityToggle visible={showConfirmPassword} onToggle={() => setShowConfirmPassword((v) => !v)} />}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              placeholder="Ripeti la password"
              secureTextEntry={!showConfirmPassword}
              autoComplete="new-password"
              nativeID="confirm-password"
              accessibilityLabel="Conferma password"
              passwordRules={PASSWORD_RULES_ATTRIBUTE}
              error={errorFor("confirm")}
              footer={<PasswordMatchHint password={password} confirmPassword={confirmPassword} />}
              onSubmitEditing={handlePassword}
            />
          ) : null}
          {isNew ? <TurnstileWidget onTokenChange={setTurnstileToken} resetSignal={turnstileReset} /> : null}
          {errorText}
          <Button variant="primary" onPress={handlePassword} disabled={isSubmitting} opacity={isSubmitting ? 0.6 : 1}>
            {isSubmitting ? "Un momento..." : `${isNew ? "Crea account" : "Accedi"}${submitSuffix}`}
          </Button>
        </YStack>
      </form>
      {isNew ? (
        <LegalNotice action="Creando l'account" />
      ) : (
        <Link href="/password-dimenticata" target="_blank" style={{ textDecoration: "none", alignSelf: "center" }}>
          <Text fontSize={16} fontWeight="600" color={brand.cianografiaScuro} textAlign="center">
            Password dimenticata?
          </Text>
        </Link>
      )}
    </YStack>
  );
}
