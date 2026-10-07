"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Surface, Text, YStack, brand, radiusDocLg } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/lib/AuthContext";

export default function ConfermaEmailPage() {
  return (
    <Suspense fallback={null}>
      <ConfermaEmail />
    </Suspense>
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
