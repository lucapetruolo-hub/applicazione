"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { acceptProfileInviteSchema, type ProfileInvitePreview } from "@professionisti/shared";
import { Button, Icon, Surface, Text, YStack, brand, radiusDocLg } from "@professionisti/ui";
import { AuthField } from "@/components/AuthField";
import { ConsentCheckbox } from "@/components/ConsentCheckbox";
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
 * informative e maggiore età, ed entra. Il profilo entra in ricerca solo
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
  const [acceptedLegalTerms, setAcceptedLegalTerms] = useState(false);
  const [declaredAdult, setDeclaredAdult] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

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
    if (password !== confirmPassword) {
      setError("Le due password non coincidono.");
      return;
    }
    const parsed = acceptProfileInviteSchema.safeParse({ token: code, password, acceptedLegalTerms, declaredAdult });
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
      setError(err instanceof Error ? err.message : "Errore imprevisto, riprova.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <YStack width="100%" alignItems="center" backgroundColor={brand.gesso} paddingVertical="$9" paddingHorizontal="$4">
      <Surface floating width="100%" maxWidth={420} borderRadius={radiusDocLg} padding="$6" gap="$5">
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
                autoComplete="new-password"
                nativeID="new-password"
                accessibilityLabel="Password"
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
                onSubmitEditing={handleSubmit}
              />
              <YStack gap="$2">
                <ConsentCheckbox checked={acceptedLegalTerms} onToggle={() => setAcceptedLegalTerms((v) => !v)}>
                  Ho letto e accetto la{" "}
                  <Link href="/privacy" target="_blank" style={{ textDecoration: "underline", color: brand.cianografia }}>
                    Privacy Policy
                  </Link>{" "}
                  e i{" "}
                  <Link href="/termini" target="_blank" style={{ textDecoration: "underline", color: brand.cianografia }}>
                    Termini di Servizio
                  </Link>
                  .
                </ConsentCheckbox>
                <ConsentCheckbox checked={declaredAdult} onToggle={() => setDeclaredAdult((v) => !v)}>
                  Dichiaro di avere almeno 18 anni.
                </ConsentCheckbox>
              </YStack>
              {error ? (
                <Text color={brand.urgenza} fontSize="$3">
                  {error}
                </Text>
              ) : null}
              <Button
                variant="primary"
                onPress={handleSubmit}
                disabled={isSubmitting || !acceptedLegalTerms || !declaredAdult}
                opacity={isSubmitting || !acceptedLegalTerms || !declaredAdult ? 0.6 : 1}
              >
                {isSubmitting ? "Un momento..." : "Scegli la password ed entra"}
              </Button>
            </YStack>
          </form>
        ) : (
          <Text color={brand.grafite70}>Controllo il link...</Text>
        )}
      </Surface>
    </YStack>
  );
}
