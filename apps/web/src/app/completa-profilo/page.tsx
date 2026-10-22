"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { PWNED_PASSWORD_MESSAGE, acceptProfileInviteSchema, passwordProblem, type ProfileInvitePreview } from "@professionisti/shared";
import { Button, Icon, Text, YStack, brand } from "@professionisti/ui";
import { AuthCard, AuthPageBackground } from "@/components/AuthPageBackground";
import { AuthField } from "@/components/AuthField";
import { LegalConsentCheckbox, scrollToLegalConsent } from "@/components/LegalConsentCheckbox";
import { PASSWORD_RULES_ATTRIBUTE, PasswordMatchHint, PasswordRules } from "@/components/PasswordRules";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/lib/AuthContext";

export default function CompletaProfiloPage() {
  return (
    <Suspense fallback={null}>
      <CompletaProfiloForm />
    </Suspense>
  );
}

/**
 * Link d'invito per un profilo creato da un operatore al telefono
 * (docs/CHANGELOG.md §170): il professionista sceglie la password, accetta
 * informative e maggiore età (una casella), ed entra. Il profilo entra in ricerca solo
 * quando lo salva da /dashboard/profilo accettando la dichiarazione.
 */
function CompletaProfiloForm() {
  const router = useRouter();
  const code = useSearchParams().get("codice") ?? "";
  const { login } = useAuth();
  const [preview, setPreview] = useState<ProfileInvitePreview | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  // Informative e maggiore età in una sola casella (docs/CHANGELOG.md §289).
  const [legalConsent, setLegalConsent] = useState(false);
  const [passwordAttempted, setPasswordAttempted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Errore della password dal server (password rubata) o lunghezza massima.
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Pulsante sempre premibile: senza spunta la casella diventa rossa
  // (docs/CHANGELOG.md §248, come in /registrati).
  const [consentAttempt, setConsentAttempt] = useState(0);

  useEffect(() => {
    if (!code) {
      setLoadError("Link incompleto. Apri di nuovo il link che ti abbiamo mandato.");
      return;
    }
    apiClient
      .getProfileInvite(code)
      .then(setPreview)
      .catch((err) => setLoadError(err instanceof Error ? err.message : "Link non valido."));
  }, [code]);

  async function handleSubmit() {
    setError(null);
    setPasswordError(null);
    const problem = passwordProblem(password);
    if (problem) {
      setPasswordAttempted(true);
      if (problem.includes("al massimo")) setPasswordError(problem);
      document.getElementById("new-password")?.focus();
      return;
    }
    if (password !== confirmPassword) {
      setError("Le due password non coincidono.");
      return;
    }
    if (!legalConsent) {
      setConsentAttempt((n) => n + 1);
      scrollToLegalConsent();
      return;
    }
    const parsed = acceptProfileInviteSchema.safeParse({ token: code, password, acceptedLegalTerms: legalConsent, declaredAdult: legalConsent });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Controlla i dati inseriti.");
      return;
    }
    setIsSubmitting(true);
    try {
      const result = await apiClient.acceptProfileInvite(parsed.data);
      await login(result.token);
      router.push("/dashboard/profilo");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Errore imprevisto, riprova.";
      if (message === PWNED_PASSWORD_MESSAGE) setPasswordError(message);
      else setError(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AuthPageBackground>
      <AuthCard>
        <YStack gap="$2">
          <Text fontFamily="$heading" fontWeight="800" fontSize="$8" color={brand.grafite}>
            Completa il tuo profilo
          </Text>
          {preview ? (
            <Text color={brand.grafite70}>
              Abbiamo preparato il profilo di <Text fontWeight="700">{preview.businessName}</Text>. Scegli la password per{" "}
              <Text fontWeight="700">{preview.email}</Text>, poi controlla i dati e salvali: solo allora il profilo comparirà nelle
              ricerche.
            </Text>
          ) : null}
        </YStack>

        {loadError ? (
          <YStack gap="$3">
            <Text color={brand.urgenza}>{loadError}</Text>
            <Link href="/accedi" style={{ color: brand.cianografia }}>
              Vai all&apos;accesso
            </Link>
          </YStack>
        ) : preview ? (
          <form onSubmit={(e) => e.preventDefault()}>
            <YStack gap="$4">
              <AuthField
                label="Password"
                rightElement={
                  <Text
                    cursor="pointer"
                    onPress={() => setShowPassword((v) => !v)}
                    accessibilityRole="button"
                    accessibilityLabel={showPassword ? "Nascondi password" : "Mostra password"}
                  >
                    <Icon name={showPassword ? "eye-off" : "eye"} size={18} strokeWidth={1.5} color={brand.grafite70} />
                  </Text>
                }
                value={password}
                onChangeText={setPassword}
                placeholder="Password"
                secureTextEntry={!showPassword}
                autoComplete="new-password"
                nativeID="new-password"
                accessibilityLabel="Password"
                passwordRules={PASSWORD_RULES_ATTRIBUTE}
                error={passwordError ?? undefined}
                invalid={passwordAttempted && passwordProblem(password) !== null}
                footer={<PasswordRules id="new-password-rules" password={password} showMissing={passwordAttempted} />}
                footerId="new-password-rules"
              />
              <AuthField
                label="Conferma password"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                placeholder="Ripeti la password"
                secureTextEntry={!showPassword}
                autoComplete="new-password"
                nativeID="new-password-confirm"
                accessibilityLabel="Conferma password"
                passwordRules={PASSWORD_RULES_ATTRIBUTE}
                footer={<PasswordMatchHint password={password} confirmPassword={confirmPassword} />}
                onSubmitEditing={handleSubmit}
              />
              <LegalConsentCheckbox checked={legalConsent} onToggle={() => setLegalConsent((v) => !v)} attempt={consentAttempt} />
              {error ? (
                <Text color={brand.urgenza} fontSize="$3">
                  {error}
                </Text>
              ) : null}
              <Button
                variant="scuro"
                onPress={handleSubmit}
                disabled={isSubmitting}
                opacity={isSubmitting ? 0.6 : 1}
              >
                {isSubmitting ? "Un momento..." : "Scegli la password ed entra"}
              </Button>
            </YStack>
          </form>
        ) : (
          <Text color={brand.grafite70}>Controllo il link...</Text>
        )}
      </AuthCard>
    </AuthPageBackground>
  );
}
