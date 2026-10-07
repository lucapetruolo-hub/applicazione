"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, Icon, Text, YStack, brand } from "@professionisti/ui";
import { AuthField } from "@/components/AuthField";
import { AuthCard, AuthPageBackground } from "@/components/AuthPageBackground";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/lib/AuthContext";

/**
 * Link ricevuto via email per reimpostare la password (docs/CHANGELOG.md
 * §185): si sceglie la nuova password e si entra subito nell'account.
 */
export function ReimpostaPasswordContent() {
  const token = useSearchParams().get("token") ?? "";
  const router = useRouter();
  const { login } = useAuth();
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit() {
    setError(null);
    if (password.length < 8) {
      setError("La password deve avere almeno 8 caratteri");
      return;
    }
    setIsSubmitting(true);
    try {
      const result = await apiClient.confirmPasswordReset(token, password);
      const currentUser = await login(result.token);
      router.push(currentUser?.isProfessional ? "/dashboard" : "/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore imprevisto, riprova.");
      setIsSubmitting(false);
    }
  }

  return (
    <AuthPageBackground>
      <AuthCard>
        <YStack gap="$2">
          <Text fontFamily="$body" fontSize={11} fontWeight="700" color={brand.cianografiaScuro}>
            Password dimenticata
          </Text>
          <Text fontFamily="$heading" fontWeight="800" fontSize="$8" color={brand.grafite}>
            Scegli una nuova password
          </Text>
        </YStack>

        {token ? (
          <YStack gap="$4">
            <AuthField
              label="Nuova password"
              hint="Almeno 8 caratteri"
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
              placeholder="Nuova password"
              secureTextEntry={!showPassword}
              autoComplete="new-password"
              nativeID="new-password"
              accessibilityLabel="Nuova password"
              onSubmitEditing={handleSubmit}
            />
            {error ? (
              <Text color={brand.urgenza} fontSize="$3">
                {error}
              </Text>
            ) : null}
            <Button variant="primary" onPress={handleSubmit} disabled={isSubmitting} opacity={isSubmitting ? 0.6 : 1}>
              {isSubmitting ? "Salvataggio..." : "Salva e accedi"}
            </Button>
          </YStack>
        ) : (
          <Text color={brand.urgenza}>Link incompleto. Apri di nuovo il link che ti abbiamo mandato, o chiedine uno nuovo.</Text>
        )}

        <Link href="/password-dimenticata" style={{ textDecoration: "none", textAlign: "center" }}>
          <Text fontSize="$3" color={brand.cianografiaScuro} textAlign="center" fontWeight="600">
            Chiedi un nuovo link
          </Text>
        </Link>
      </AuthCard>
    </AuthPageBackground>
  );
}
