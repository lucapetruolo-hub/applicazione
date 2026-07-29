"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { registerSchema } from "@professionisti/shared";
import { Button, Field, Icon, Text, YStack, brand } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/lib/AuthContext";
import { GoogleSignInButton } from "@/components/GoogleSignInButton";

export default function RegistratiPage() {
  return (
    <Suspense fallback={null}>
      <RegistratiForm />
    </Suspense>
  );
}

function RegistratiForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login } = useAuth();

  const isProfessional = searchParams.get("ruolo") === "professionista";
  const role = isProfessional ? "PROFESSIONAL" : "CLIENT";

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Con Google Sign-In questa pagina può autenticare anche un account
  // professionista già esistente (es. cliccando "Iscriviti gratis" da
  // /per-professionisti pur avendo già un profilo) — non solo una vera
  // registrazione. `isNewUser` (già restituito da /auth/register e
  // /auth/google/verify) distingue i due casi: solo chi si è appena
  // registrato deve completare il profilo, chi ha già un account va
  // dritto in Dashboard — bug reale segnalato dall'utente, prima si
  // finiva sempre su /dashboard/profilo anche da loggati.
  function afterAuth(isNewUser: boolean) {
    if (!isProfessional) {
      router.push("/");
      return;
    }
    router.push(isNewUser ? "/dashboard/profilo" : "/dashboard");
  }

  async function handleRegister() {
    setError(null);
    const result = registerSchema.safeParse({
      email: email.trim(),
      password,
      name: name.trim() || undefined,
      role,
    });
    if (!result.success) {
      setError(result.error.issues[0]?.message ?? "Dati non validi.");
      return;
    }

    setIsSubmitting(true);
    try {
      const { token, isNewUser } = await apiClient.register(result.data.email, result.data.password, result.data.name, result.data.role);
      await login(token);
      afterAuth(isNewUser);
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
      const { token, isNewUser } = await apiClient.verifyGoogle(idToken, role);
      await login(token);
      afterAuth(isNewUser);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore imprevisto, riprova.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <YStack width="100%" alignItems="center" backgroundColor={brand.gesso} paddingVertical="$9" paddingHorizontal="$4">
      <YStack width="100%" maxWidth={420} gap="$5">
        <YStack gap="$2">
          <Text fontFamily="$mono" fontSize={11} fontWeight="500" letterSpacing={0.8} textTransform="uppercase" color={brand.cianografia}>
            {isProfessional ? "Professionisti" : "Registrati"}
          </Text>
          <Text fontFamily="$heading" fontWeight="800" fontSize="$8" color={brand.grafite}>
            {isProfessional ? "Iscriviti come professionista" : "Crea il tuo account"}
          </Text>
          {isProfessional ? (
            <Text color={brand.grafite70}>Gratis per iniziare: completa il profilo e inizia a ricevere richieste.</Text>
          ) : null}
        </YStack>

        <GoogleSignInButton onCredential={handleGoogleCredential} />

        {process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ? (
          <YStack flexDirection="row" alignItems="center" gap="$3">
            <YStack flex={1} height={1} backgroundColor={brand.filetto} />
            <Text fontFamily="$mono" fontSize={11} textTransform="uppercase" color={brand.grafite70}>
              oppure
            </Text>
            <YStack flex={1} height={1} backgroundColor={brand.filetto} />
          </YStack>
        ) : null}

        <YStack gap="$4">
          <Field label="Nome (opzionale)" value={name} onChangeText={setName} placeholder="Il tuo nome" accessibilityLabel="Nome" />
          <Field
            label="Email"
            value={email}
            onChangeText={setEmail}
            placeholder="nome@esempio.it"
            keyboardType="email-address"
            autoCapitalize="none"
            accessibilityLabel="Email"
          />
          <Field
            label="Password"
            hint="Minimo 8 caratteri"
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
            accessibilityLabel="Password"
            onSubmitEditing={handleRegister}
          />

          {error ? (
            <Text color={brand.urgenza} fontSize="$3">
              {error}
            </Text>
          ) : null}

          <Button variant="primary" onPress={handleRegister} disabled={isSubmitting} opacity={isSubmitting ? 0.6 : 1}>
            {isSubmitting ? "Creazione account..." : "Registrati"}
          </Button>
        </YStack>

        <Text fontSize="$3" textAlign="center" color={brand.grafite70}>
          Hai già un account?{" "}
          <Link href="/accedi" style={{ textDecoration: "none" }}>
            <Text color={brand.cianografia} fontWeight="600">
              Accedi
            </Text>
          </Link>
        </Text>
      </YStack>
    </YStack>
  );
}
