"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { registerSchema } from "@professionisti/shared";
import { Button, H1, Text, YStack } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/lib/AuthContext";
import { GoogleSignInButton } from "@/components/GoogleSignInButton";
import { AuthInput } from "@/components/AuthInput";

export default function RegistratiPage() {
  const router = useRouter();
  const { login } = useAuth();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleRegister() {
    setError(null);
    const result = registerSchema.safeParse({
      email: email.trim(),
      password,
      name: name.trim() || undefined,
    });
    if (!result.success) {
      setError(result.error.issues[0]?.message ?? "Dati non validi.");
      return;
    }

    setIsSubmitting(true);
    try {
      const { token } = await apiClient.register(result.data.email, result.data.password, result.data.name);
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
        <H1 size="$8">Crea il tuo account</H1>

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
          <AuthInput
            icon={<Text fontSize="$4">👤</Text>}
            size="$5"
            value={name}
            onChangeText={setName}
            placeholder="Nome (opzionale)"
            accessibilityLabel="Nome"
          />
          <AuthInput
            icon={<Text fontSize="$4">✉️</Text>}
            size="$5"
            value={email}
            onChangeText={setEmail}
            placeholder="E-mail"
            keyboardType="email-address"
            autoCapitalize="none"
            accessibilityLabel="Email"
          />
          <AuthInput
            icon={<Text fontSize="$4">🔒</Text>}
            rightElement={
              <Text
                fontSize="$4"
                cursor="pointer"
                onPress={() => setShowPassword((v) => !v)}
                accessibilityRole="button"
                accessibilityLabel={showPassword ? "Nascondi password" : "Mostra password"}
              >
                {showPassword ? "🙈" : "👁️"}
              </Text>
            }
            size="$5"
            value={password}
            onChangeText={setPassword}
            placeholder="Password (min. 8 caratteri)"
            secureTextEntry={!showPassword}
            accessibilityLabel="Password"
            onSubmitEditing={handleRegister}
          />

          {error ? (
            <Text color="$red10" fontSize="$3">
              {error}
            </Text>
          ) : null}

          <Button size="$5" onPress={handleRegister} disabled={isSubmitting} opacity={isSubmitting ? 0.6 : 1}>
            {isSubmitting ? "Creazione account..." : "Registrati"}
          </Button>
        </YStack>

        <Text fontSize="$3" textAlign="center">
          Hai già un account?{" "}
          <Link href="/accedi" style={{ textDecoration: "none" }}>
            <Text color="$blue10" fontWeight="600">
              Accedi
            </Text>
          </Link>
        </Text>
      </YStack>
    </YStack>
  );
}
