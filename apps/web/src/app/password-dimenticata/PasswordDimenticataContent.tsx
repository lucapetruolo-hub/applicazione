"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { passwordResetRequestSchema } from "@professionisti/shared";
import { Button, Text, YStack, brand } from "@professionisti/ui";
import { AuthField } from "@/components/AuthField";
import { EmailCodeForm } from "@/components/EmailCodeForm";
import { AuthCard, AuthPageBackground } from "@/components/AuthPageBackground";
import { AuthStepHeader } from "@/components/AuthStepHeader";
import { apiClient } from "@/lib/apiClient";
import { TURNSTILE_PENDING_MESSAGE, TurnstileWidget, isTurnstileEnabled } from "@/components/TurnstileWidget";

/**
 * Recupero password (docs/CHANGELOG.md §185): si chiede il link via email.
 * La risposta è sempre la stessa, che l'account esista o no. Dal §245 la
 * stessa email porta anche un codice di 6 cifre da scrivere qui: utile quando
 * l'email si legge sul telefono e la password si cambia dal computer.
 */
export function PasswordDimenticataContent() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileReset, setTurnstileReset] = useState(0);
  const router = useRouter();
  const resetToken = useRef<string | null>(null);

  async function handleSubmit() {
    setError(null);
    const parsed = passwordResetRequestSchema.safeParse({ email });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Email non valida");
      return;
    }
    if (isTurnstileEnabled() && !turnstileToken) {
      setError(TURNSTILE_PENDING_MESSAGE);
      return;
    }
    setIsSubmitting(true);
    try {
      await apiClient.requestPasswordReset(parsed.data.email, turnstileToken ?? undefined);
      setSentTo(parsed.data.email);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore imprevisto, riprova.");
    } finally {
      // Il token anti-bot vale una volta sola: nuovo token per il prossimo invio
      // (anche "prova con un altro indirizzo" dopo un invio riuscito).
      setTurnstileReset((n) => n + 1);
      setIsSubmitting(false);
    }
  }

  return (
    <AuthPageBackground>
      <AuthCard>
        {/* Stessa intestazione della registrazione (docs/CHANGELOG.md §279):
            "Indietro" torna all'accesso, o all'email dopo l'invio del codice. */}
        <AuthStepHeader
          icon={sentTo ? "mail" : "key-round"}
          title={sentTo ? "Controlla la tua email" : "Reimposta la password"}
          step={{ current: sentTo ? 2 : 1, total: 2 }}
          onBack={sentTo ? () => setSentTo(null) : () => router.push("/accedi")}
        />

        {sentTo ? (
          <YStack gap="$4">
            <EmailCodeForm
              token=""
              email={sentTo}
              initialResendSeconds={60}
              intro="Se esiste un account, ti abbiamo mandato un codice di"
              doneLabel="Codice giusto"
              tip="Non la trovi? Guarda anche in Spam o Promozioni. Puoi anche premere il pulsante nell'email: vale 60 minuti."
              submitCode={async (code) => {
                resetToken.current = (await apiClient.exchangePasswordResetCode(sentTo, code)).token;
              }}
              onVerified={() => {
                if (resetToken.current) router.push(`/reimposta-password?token=${encodeURIComponent(resetToken.current)}`);
              }}
              onRequestNewCode={() => setSentTo(null)}
            />
            <button type="button" className="link-button" onClick={() => setSentTo(null)}>
              Prova con un altro indirizzo
            </button>
          </YStack>
        ) : (
          <YStack gap="$4">
            <Text fontSize="$3" color={brand.grafite70} textAlign="center">
              Ti mandiamo un codice per sceglierne una nuova.
            </Text>
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
              error={error && error !== TURNSTILE_PENDING_MESSAGE ? error : undefined}
              onSubmitEditing={handleSubmit}
            />
            <TurnstileWidget onTokenChange={setTurnstileToken} resetSignal={turnstileReset} />
            {error === TURNSTILE_PENDING_MESSAGE ? (
              <Text role="alert" color={brand.urgenza} fontSize="$3">
                {error}
              </Text>
            ) : null}
            <Button variant="scuro" onPress={handleSubmit} disabled={isSubmitting} opacity={isSubmitting ? 0.6 : 1}>
              {isSubmitting ? "Invio in corso..." : "Mandami il codice"}
            </Button>
          </YStack>
        )}

      </AuthCard>
    </AuthPageBackground>
  );
}
