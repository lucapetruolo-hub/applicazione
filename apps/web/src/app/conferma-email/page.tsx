"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Surface, Text, YStack, brand, radiusDocLg } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/lib/AuthContext";
import { EmailCodeForm } from "@/components/EmailCodeForm";

export default function ConfermaEmailPage() {
  return (
    <Suspense fallback={null}>
      <ConfermaEmailRouter />
    </Suspense>
  );
}

/** Con `?token=` è il pulsante dell'email; senza, si scrive il codice di 6 cifre (docs/CHANGELOG.md §243). */
function ConfermaEmailRouter() {
  const token = useSearchParams().get("token");
  return token ? <ConfermaEmail /> : <ConfermaConCodice />;
}

function ConfermaConCodice() {
  const router = useRouter();
  const { user, token, isLoading, refreshUser } = useAuth();

  useEffect(() => {
    if (!isLoading && !user) router.replace("/accedi?redirect=/conferma-email");
  }, [isLoading, user, router]);

  if (!user || !token) return null;
  const nextHref = user.isProfessional ? "/dashboard" : "/account";

  return (
    <YStack width="100%" alignItems="center" backgroundColor="transparent" paddingVertical="$9" paddingHorizontal="$4">
      <Surface floating width="100%" maxWidth={440} borderRadius={radiusDocLg} padding="$6" gap="$5">
        <Text tag="h1" fontFamily="$heading" fontWeight="800" fontSize="$8" color={brand.grafite} textAlign="center">
          Conferma la tua email
        </Text>
        {user.emailVerified ? (
          <YStack gap="$4" alignItems="center">
            <Text color={brand.grafite70} textAlign="center">
              L&apos;indirizzo <Text fontWeight="700">{user.email}</Text> è già confermato.
            </Text>
            <Link href={nextHref} style={{ color: brand.cianografiaScuro, fontWeight: 700 }}>
              Continua
            </Link>
          </YStack>
        ) : (
          <EmailCodeForm
            token={token}
            email={user.email ?? ""}
            initialResendSeconds={user.emailCodeResendInSeconds ?? 0}
            allowChangeEmail={user.isProfessional}
            onEmailChanged={() => void refreshUser().catch(() => {})}
            onVerified={async () => {
              await refreshUser().catch(() => {});
              router.push(nextHref);
            }}
          />
        )}
      </Surface>
    </YStack>
  );
}

/**
 * Link ricevuto via email dopo la registrazione (docs/CHANGELOG.md §178).
 * Il codice vale una volta sola: il ref evita la seconda chiamata che React
 * fa in sviluppo, che fallirebbe con "link non valido".
 */
function ConfermaEmail() {
  const token = useSearchParams().get("token") ?? "";
  const { user, refreshUser } = useAuth();
  const [confirmedEmail, setConfirmedEmail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (!token) {
      setError("Link incompleto. Apri di nuovo il link che ti abbiamo mandato.");
      return;
    }
    apiClient
      .verifyEmail(token)
      .then((result) => {
        setConfirmedEmail(result.email);
        void refreshUser();
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Link non valido."));
  }, [token, refreshUser]);

  const nextHref = user?.isProfessional ? "/dashboard" : user ? "/le-mie-richieste" : "/accedi";
  const nextLabel = user ? "Continua" : "Vai all'accesso";

  return (
    <YStack width="100%" alignItems="center" backgroundColor="transparent" paddingVertical="$9" paddingHorizontal="$4">
      <Surface floating width="100%" maxWidth={420} borderRadius={radiusDocLg} padding="$6" gap="$4">
        <Text fontFamily="$heading" fontWeight="800" fontSize="$8" color={brand.grafite}>
          Conferma email
        </Text>
        {confirmedEmail ? (
          <Text color={brand.grafite70}>
            Grazie! L&apos;indirizzo <Text fontWeight="700">{confirmedEmail}</Text> è confermato.
          </Text>
        ) : error ? (
          <Text color={brand.urgenza}>{error}</Text>
        ) : (
          <Text color={brand.grafite70}>Controllo il link...</Text>
        )}
        {confirmedEmail || error ? (
          <Link href={nextHref} style={{ color: brand.cianografia }}>
            {nextLabel}
          </Link>
        ) : null}
      </Surface>
    </YStack>
  );
}
