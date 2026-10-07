"use client";

import { useState } from "react";
import Link from "next/link";
import { passwordResetRequestSchema } from "@professionisti/shared";
import { Button, Text, YStack, brand } from "@professionisti/ui";
import { AuthField } from "@/components/AuthField";
import { AuthCard, AuthPageBackground } from "@/components/AuthPageBackground";
import { apiClient } from "@/lib/apiClient";

/**
 * Recupero password (docs/CHANGELOG.md §183): si chiede il link via email.
 * La risposta è sempre la stessa, che l'account esista o no.
 */
export function PasswordDimenticataContent() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit() {
    setError(null);
    const parsed = passwordResetRequestSchema.safeParse({ email });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Email non valida");
      return;
    }
    setIsSubmitting(true);
    try {
      await apiClient.requestPasswordReset(parsed.data.email);
      setSentTo(parsed.data.email);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore imprevisto, riprova.");
    } finally {
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
            {sentTo ? "Controlla la tua email" : "Reimposta la password"}
          </Text>
        </YStack>

        {sentTo ? (
          <YStack gap="$3">
            <Text color={brand.grafite70}>
              Se esiste un account con <Text fontWeight="700">{sentTo}</Text>, ti abbiamo mandato un link per scegliere una nuova
              password. Vale 60 minuti.
            </Text>
            <Text color={brand.grafite70} fontSize="$3">
              Non la trovi? Guarda anche nello spam, oppure{" "}
              <Text color={brand.cianografiaScuro} fontWeight="600" cursor="pointer" onPress={() => setSentTo(null)} accessibilityRole="button">
                prova con un altro indirizzo
              </Text>
              .
            </Text>
          </YStack>
        ) : (
          <YStack gap="$4">
            <Text color={brand.grafite70}>Scrivi l&apos;email del tuo account: ti mandiamo un link per sceglierne una nuova.</Text>
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
              onSubmitEditing={handleSubmit}
            />
            {error ? (
              <Text color={brand.urgenza} fontSize="$3">
                {error}
              </Text>
            ) : null}
            <Button variant="primary" onPress={handleSubmit} disabled={isSubmitting} opacity={isSubmitting ? 0.6 : 1}>
              {isSubmitting ? "Invio in corso..." : "Mandami il link"}
            </Button>
          </YStack>
        )}

        <Link href="/accedi" style={{ textDecoration: "none", textAlign: "center" }}>
          <Text fontSize="$3" color={brand.cianografiaScuro} textAlign="center" fontWeight="600">
            Torna all&apos;accesso
          </Text>
        </Link>
      </AuthCard>
    </AuthPageBackground>
  );
}
