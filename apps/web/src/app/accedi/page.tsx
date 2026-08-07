"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { emailPasswordSchema } from "@professionisti/shared";
import { Button, Field, Icon, Text, YStack, brand } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/lib/AuthContext";
import { GoogleSignInButton } from "@/components/GoogleSignInButton";

export default function AccediPage() {
  return (
    <Suspense fallback={null}>
      <AccediForm />
    </Suspense>
  );
}

function AccediForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Un redirect esplicito in URL (es. "Accedi come professionista" da
  // /dashboard/profilo) vince sempre; senza, un professionista va dritto
  // in Dashboard invece che sulla home — richiesta esplicita dell'utente,
  // sulla home non ha nulla da fare appena entrato.
  const explicitRedirect = searchParams.get("redirect");
  const { login } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  function destinationAfterLogin(role: "CLIENT" | "PROFESSIONAL" | "ADMIN" | undefined) {
    if (explicitRedirect) return explicitRedirect;
    return role === "PROFESSIONAL" ? "/dashboard" : "/";
  }

  async function handleLogin() {
    setError(null);
    const result = emailPasswordSchema.safeParse({ email: email.trim(), password });
    if (!result.success) {
      setError(result.error.issues[0]?.message ?? "Dati non validi.");
      return;
    }

    setIsSubmitting(true);
    try {
      const { token } = await apiClient.login(result.data.email, result.data.password);
      const currentUser = await login(token);
      router.push(destinationAfterLogin(currentUser?.role));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore imprevisto, riprova.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleGoogleCredential(idToken: string) {
    setError(null);
    setIsSubmitting(true);
    try {
      // createIfMissing=false: da questa pagina "Accedi con Google" non deve
      // mai iscrivere silenziosamente un account nuovo su un'email mai
      // registrata (bug reale segnalato dall'utente) — se non esiste ancora
      // nessun account, l'API rifiuta esplicitamente (vedi catch sotto) e si
      // rimanda alla scelta cliente/professionista su /registrati, dove
      // createIfMissing resta true (comportamento di default).
      const { token } = await apiClient.verifyGoogle(idToken, undefined, false);
      const currentUser = await login(token);
      router.push(destinationAfterLogin(currentUser?.role));
    } catch (err) {
      if (err instanceof Error && err.message === "Nessun account trovato con questa email.") {
        router.push("/registrati?motivo=nessun-account");
        return;
      }
      setError(err instanceof Error ? err.message : "Errore imprevisto, riprova.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <YStack width="100%" alignItems="center" backgroundColor={brand.gesso} paddingVertical="$9" paddingHorizontal="$4">
      <YStack width="100%" maxWidth={420} gap="$5">
        <YStack gap="$2">
          <Text fontFamily="$body" fontSize={11} fontWeight="700" color={brand.cianografia}>
            Accedi
          </Text>
          <Text fontFamily="$heading" fontWeight="800" fontSize="$8" color={brand.grafite}>
            Bentornato
          </Text>
        </YStack>

        <GoogleSignInButton onCredential={handleGoogleCredential} />

        {process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ? (
          <YStack flexDirection="row" alignItems="center" gap="$3">
            <YStack flex={1} height={1} backgroundColor={brand.filetto} />
            <Text fontFamily="$body" fontWeight="700" fontSize={11} color={brand.grafite70}>
              oppure
            </Text>
            <YStack flex={1} height={1} backgroundColor={brand.filetto} />
          </YStack>
        ) : null}

        <YStack gap="$4">
          <Field
            label="Email"
            value={email}
            onChangeText={setEmail}
            placeholder="nome@esempio.it"
            keyboardType="email-address"
            autoCapitalize="none"
            // Mancava del tutto (bug reale segnalato dall'utente: l'email
            // con cui si accede, incluso un account admin, non restava mai
            // salvata/suggerita dal browser/gestore password) — "username"
            // è il valore standard per il campo identificativo di un form
            // di login, abbinato a "current-password" già presente sotto:
            // senza entrambi il browser non riconosce la coppia come
            // credenziali da salvare.
            autoComplete="username"
            accessibilityLabel="Email"
            onSubmitEditing={handleLogin}
          />
          <Field
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
            autoComplete="current-password"
            accessibilityLabel="Password"
            onSubmitEditing={handleLogin}
          />

          {error ? (
            <Text color={brand.urgenza} fontSize="$3">
              {error}
            </Text>
          ) : null}

          <Button variant="primary" onPress={handleLogin} disabled={isSubmitting} opacity={isSubmitting ? 0.6 : 1}>
            {isSubmitting ? "Accesso in corso..." : "Accedi"}
          </Button>

          <Link href="/password-dimenticata" style={{ textDecoration: "none", textAlign: "center" }}>
            <Text fontSize="$3" color={brand.cianografia} textAlign="center" fontWeight="600">
              Hai dimenticato la password?
            </Text>
          </Link>
        </YStack>

        <YStack borderTopWidth={1} borderTopColor={brand.filetto} paddingTop="$4" gap="$3">
          <Text fontSize="$3" textAlign="center" color={brand.grafite70}>
            Non hai ancora un account?{" "}
            <Link href="/registrati" style={{ textDecoration: "none" }}>
              <Text color={brand.cianografia} fontWeight="600">
                Registrati
              </Text>
            </Link>
          </Text>
        </YStack>

        <YStack gap="$2">
          <Text
            fontFamily="$body"
            fontSize={13}
            fontWeight="700"
            color={brand.grafite}
            cursor="pointer"
            onPress={() => setHelpOpen((open) => !open)}
            accessibilityRole="button"
            accessibilityLabel={helpOpen ? "Chiudi la sezione di aiuto" : "Apri la sezione di aiuto"}
          >
            Hai bisogno di aiuto? {helpOpen ? "−" : "+"}
          </Text>
          {helpOpen ? (
            <Text color={brand.grafite70} fontSize="$3">
              Se non riesci ad accedere, verifica di aver inserito correttamente email e password. Per problemi
              persistenti scrivi a supporto@professionisti.it.
            </Text>
          ) : null}
        </YStack>
      </YStack>
    </YStack>
  );
}
