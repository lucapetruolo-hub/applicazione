"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { emailStatusSchema, type EmailStatus } from "@professionisti/shared";
import { Button, Icon, Text, XStack, YStack, brand } from "@professionisti/ui";
import { AuthField } from "@/components/AuthField";
import { GoogleSignInButton } from "@/components/GoogleSignInButton";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/lib/AuthContext";

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
    <Text fontSize="$2" lineHeight={18} color={brand.grafite70} textAlign="center">
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
      <Text fontSize="$3" color={brand.grafite} numberOfLines={1} flexShrink={1}>
        {email}
      </Text>
      <Text fontSize="$3" fontWeight="600" color={brand.cianografiaScuro} cursor="pointer" onPress={onEdit} accessibilityRole="button">
        Modifica
      </Text>
    </XStack>
  );
}

function PasswordToggle({ visible, onToggle }: { visible: boolean; onToggle: () => void }) {
  return (
    <Text cursor="pointer" onPress={onToggle} accessibilityRole="button" accessibilityLabel={visible ? "Nascondi password" : "Mostra password"}>
      <Icon name={visible ? "eye-off" : "eye"} size={18} strokeWidth={1.5} color={brand.grafite70} />
    </Text>
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
 * due volte (docs/CHANGELOG.md §192, richiesta dell'utente).
 * Usato dal popup della richiesta (InlineAuthGate) e da /registrati?ruolo=cliente.
 */
export function ClientEmailFirstAuth({
  renderHeader,
  intro,
  firstTimeNote,
  submitSuffix,
  onAuthenticated,
}: {
  /** Intestazione del passo corrente (titolo, eventuale pulsante di chiusura). */
  renderHeader: (step: Step) => ReactNode;
  intro: string;
  firstTimeNote: string;
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
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function editEmail() {
    setStep("email");
    setPassword("");
    setConfirmPassword("");
    setError(null);
  }

  async function run(action: () => Promise<void>) {
    setError(null);
    setIsSubmitting(true);
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore imprevisto, riprova.");
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleContinue() {
    const parsed = emailStatusSchema.safeParse({ email: email.trim() });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Email non valida");
      return;
    }
    void run(async () => {
      const { status } = await apiClient.emailStatus(parsed.data.email);
      setEmail(parsed.data.email);
      setStep(status);
    });
  }

  function handlePassword() {
    if (password.length < 8) {
      setError("La password deve avere almeno 8 caratteri");
      return;
    }
    if (step === "new" && password !== confirmPassword) {
      setError("Le due password non coincidono");
      return;
    }
    void run(async () => {
      const { token, isNewUser } =
        step === "new"
          ? await apiClient.register(email, password, undefined, "CLIENT", true, true)
          : await apiClient.login(email, password);
      await login(token);
      onAuthenticated(isNewUser);
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

  const errorText = error ? (
    <Text color={brand.urgenza} fontSize="$3">
      {error}
    </Text>
  ) : null;

  if (step === "email") {
    return (
      <YStack gap="$4">
        {renderHeader(step)}
        <Text fontSize="$3" color={brand.grafite70}>
          {intro}
        </Text>
        <GoogleSignInButton onCredential={handleGoogle} disabled={isSubmitting} />
        {process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ? (
          <XStack alignItems="center" gap="$3">
            <YStack flex={1} height={1} backgroundColor={brand.filetto} />
            <Text fontFamily="$body" fontWeight="700" fontSize={11} color={brand.grafite70}>
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
              onChangeText={setEmail}
              placeholder="nome@esempio.it"
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="username"
              nativeID="email"
              accessibilityLabel="Email"
              onSubmitEditing={handleContinue}
            />
            {errorText}
            <Button variant="primary" onPress={handleContinue} disabled={isSubmitting} opacity={isSubmitting ? 0.6 : 1}>
              {isSubmitting ? "Un momento..." : "Continua"}
            </Button>
          </YStack>
        </form>
        <LegalNotice action="Continuando" />
        <Text fontSize="$2" lineHeight={18} color={brand.grafite70} textAlign="center">
          {firstTimeNote}
        </Text>
      </YStack>
    );
  }

  if (step === "google") {
    return (
      <YStack gap="$4">
        {renderHeader(step)}
        <EmailPill email={email} onEdit={editEmail} />
        <Text fontSize="$3" color={brand.grafite70}>
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
      {renderHeader(step)}
      <EmailPill email={email} onEdit={editEmail} />
      <Text fontSize="$3" color={brand.grafite70}>
        {isNew
          ? "Non c'è ancora un account con questa email: scegli una password e scrivila due volte."
          : "Con questa email hai già un account: inserisci la tua password per accedere."}
      </Text>
      <form onSubmit={(e) => e.preventDefault()}>
        <YStack gap="$4">
          {/* Email nascosta accanto alla password: i gestori di password la
              salvano insieme (stesso motivo dell'autoComplete in /registrati). */}
          <input type="email" name="email" autoComplete="username" value={email} readOnly hidden />
          <AuthField
            label={isNew ? "Scegli una password" : "Password"}
            hint={isNew ? "Minimo 8 caratteri" : undefined}
            rightElement={<PasswordToggle visible={showPassword} onToggle={() => setShowPassword((v) => !v)} />}
            value={password}
            onChangeText={setPassword}
            placeholder="Password"
            secureTextEntry={!showPassword}
            autoComplete={isNew ? "new-password" : "current-password"}
            nativeID={isNew ? "new-password" : "current-password"}
            accessibilityLabel="Password"
            onSubmitEditing={handlePassword}
          />
          {isNew ? (
            <AuthField
              label="Conferma password"
              rightElement={<PasswordToggle visible={showConfirmPassword} onToggle={() => setShowConfirmPassword((v) => !v)} />}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              placeholder="Ripeti la password"
              secureTextEntry={!showConfirmPassword}
              autoComplete="new-password"
              nativeID="confirm-password"
              accessibilityLabel="Conferma password"
              onSubmitEditing={handlePassword}
            />
          ) : null}
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
          <Text fontSize="$3" fontWeight="600" color={brand.cianografiaScuro} textAlign="center">
            Password dimenticata?
          </Text>
        </Link>
      )}
    </YStack>
  );
}
