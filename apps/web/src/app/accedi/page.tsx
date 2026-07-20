"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { emailPasswordSchema } from "@professionisti/shared";
import { Button, H1, Input, Paragraph, Text, YStack } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/lib/AuthContext";
import { GoogleSignInButton } from "@/components/GoogleSignInButton";

export default function AccediPage() {
  const router = useRouter();
  const { login } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

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
      await login(token);
      router.push("/");
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
      const { token } = await apiClient.verifyGoogle(idToken);
      await login(token);
      router.push("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore imprevisto, riprova.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <YStack width="100%" alignItems="center" paddingVertical="$9" paddingHorizontal="$4">
      <YStack width="100%" maxWidth={420} gap="$4">
        <H1 size="$8">Effettua il login al tuo account</H1>

        <GoogleSignInButton onCredential={handleGoogleCredential} />

        {process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ? (
          <YStack flexDirection="row" alignItems="center" gap="$3">
            <YStack flex={1} height={1} backgroundColor="$borderColor" />
            <Text color="$color9" fontSize="$2">
              o
            </Text>
            <YStack flex={1} height={1} backgroundColor="$borderColor" />
          </YStack>
        ) : null}

        <YStack gap="$3">
          <Input
            size="$5"
            value={email}
            onChangeText={setEmail}
            placeholder="E-mail"
            keyboardType="email-address"
            autoCapitalize="none"
            accessibilityLabel="Email"
            onSubmitEditing={handleLogin}
          />
          <YStack position="relative">
            <Input
              size="$5"
              value={password}
              onChangeText={setPassword}
              placeholder="Password"
              secureTextEntry={!showPassword}
              accessibilityLabel="Password"
              onSubmitEditing={handleLogin}
            />
            <Text
              position="absolute"
              right="$3"
              top="$3"
              fontSize="$2"
              color="$blue10"
              cursor="pointer"
              onPress={() => setShowPassword((v) => !v)}
              accessibilityRole="button"
              accessibilityLabel={showPassword ? "Nascondi password" : "Mostra password"}
            >
              {showPassword ? "Nascondi" : "Mostra"}
            </Text>
          </YStack>

          {error ? (
            <Text color="$red10" fontSize="$3">
              {error}
            </Text>
          ) : null}

          <Button size="$5" onPress={handleLogin} disabled={isSubmitting} opacity={isSubmitting ? 0.6 : 1}>
            {isSubmitting ? "Accesso in corso..." : "Login"}
          </Button>

          <Link href="/password-dimenticata" style={{ textDecoration: "none", textAlign: "center" }}>
            <Text fontSize="$3" color="$blue10" textAlign="center">
              Hai dimenticato la password?
            </Text>
          </Link>
        </YStack>

        <YStack borderTopWidth={1} borderTopColor="$borderColor" paddingTop="$4" gap="$3">
          <Text fontSize="$3" textAlign="center">
            Non hai ancora un account?{" "}
            <Link href="/registrati" style={{ textDecoration: "none" }}>
              <Text color="$blue10" fontWeight="600">
                Registrati!
              </Text>
            </Link>
          </Text>
        </YStack>

        <YStack gap="$2">
          <Text
            fontSize="$3"
            fontWeight="600"
            cursor="pointer"
            onPress={() => setHelpOpen((open) => !open)}
            accessibilityRole="button"
            accessibilityLabel={helpOpen ? "Chiudi la sezione di aiuto" : "Apri la sezione di aiuto"}
          >
            Hai bisogno di aiuto? {helpOpen ? "▲" : "▼"}
          </Text>
          {helpOpen ? (
            <Paragraph color="$color10" fontSize="$3">
              Se non riesci ad accedere, verifica di aver inserito correttamente email e password. Per problemi
              persistenti scrivi a supporto@professionisti.it.
            </Paragraph>
          ) : null}
        </YStack>
      </YStack>
    </YStack>
  );
}
