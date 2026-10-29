"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Button, Text, YStack, brand } from "@professionisti/ui";
import { AuthCard, AuthPageBackground } from "@/components/AuthPageBackground";
import { AuthIconBadge } from "@/components/AuthStepHeader";
import { apiClient } from "@/lib/apiClient";

export default function EmailNotifichePage() {
  return (
    <Suspense fallback={null}>
      <EmailOff />
    </Suspense>
  );
}

/**
 * "Non ricevere più email come questa" dal link in fondo alle email
 * (docs/changelog/2026-10-29-notifiche-email-riassunto-e-notte.md), senza
 * accedere. Serve il tocco sul pulsante, come per la conferma dell'email:
 * i programmi che controllano i link nelle caselle di posta aprono la pagina
 * da soli e non devono spegnere niente al posto della persona.
 */
function EmailOff() {
  const token = useSearchParams().get("t") ?? "";
  const [label, setLabel] = useState<string | null>(null);
  const [off, setOff] = useState(false);
  const [state, setState] = useState<"loading" | "ready" | "saving" | "invalid" | "error">(token ? "loading" : "invalid");

  useEffect(() => {
    if (!token) return;
    let active = true;
    apiClient
      .notificationEmailOff(token)
      .then((result) => {
        if (!active) return;
        setLabel(result.label);
        setOff(result.off);
        setState("ready");
      })
      .catch((err: unknown) => {
        if (active) setState((err as { status?: number }).status === 404 ? "invalid" : "error");
      });
    return () => {
      active = false;
    };
  }, [token]);

  async function choose(nextOff: boolean) {
    setState("saving");
    try {
      const result = await apiClient.notificationEmailOff(token, nextOff);
      setOff(result.off);
      setState("ready");
    } catch {
      setState("error");
    }
  }

  return (
    <AuthPageBackground>
      <AuthCard maxWidth={440}>
        {state === "invalid" ? (
          <YStack gap="$4" alignItems="center">
            <AuthIconBadge icon="mail" />
            <Text tag="h1" fontFamily="$heading" fontWeight="800" fontSize="$8" color={brand.grafite} textAlign="center">
              Questo link non vale
            </Text>
            <Text fontSize={16} color={brand.grafite70} textAlign="center">
              Puoi scegliere quali email ricevere dalle preferenze di notifica.
            </Text>
            <Link href="/account/notifiche" className="auth-primary-link">
              Apri le preferenze
            </Link>
          </YStack>
        ) : state === "loading" ? (
          <Text fontSize={16} color={brand.grafite70} textAlign="center" role="status">
            Un attimo…
          </Text>
        ) : off ? (
          <YStack gap="$4" alignItems="center">
            <AuthIconBadge icon="check" />
            <Text tag="h1" fontFamily="$heading" fontWeight="800" fontSize="$8" color={brand.grafite} textAlign="center">
              Fatto, niente più email
            </Text>
            <Text fontSize={16} color={brand.grafite70} textAlign="center" role="status">
              Non ti mandiamo più email di <Text fontWeight="700">{label}</Text>. Le trovi comunque nella campanella del sito.
            </Text>
            <Button variant="secondary" width="100%" onPress={() => void choose(false)} disabled={state === "saving"} opacity={state === "saving" ? 0.6 : 1}>
              Annulla, voglio riceverle
            </Button>
            <Link href="/account/notifiche" className="notif-link">
              Tutte le preferenze di notifica
            </Link>
          </YStack>
        ) : (
          <YStack gap="$4" alignItems="center">
            <AuthIconBadge icon="bell-off" />
            <Text tag="h1" fontFamily="$heading" fontWeight="800" fontSize="$8" color={brand.grafite} textAlign="center">
              Basta email di «{label}»?
            </Text>
            <Text fontSize={16} color={brand.grafite70} textAlign="center">
              Le altre email restano come sono. Questi avvisi continui a vederli nella campanella del sito.
            </Text>
            <Button variant="primary" width="100%" onPress={() => void choose(true)} disabled={state === "saving"} opacity={state === "saving" ? 0.6 : 1}>
              {state === "saving" ? "Un attimo…" : "Non riceverle più"}
            </Button>
            <Link href="/account/notifiche" className="notif-link">
              Tutte le preferenze di notifica
            </Link>
          </YStack>
        )}
        {state === "error" ? (
          <Text fontSize={16} color={brand.urgenza} textAlign="center" role="alert">
            Non siamo riusciti a salvare. Riprova tra qualche istante.
          </Text>
        ) : null}
      </AuthCard>
    </AuthPageBackground>
  );
}
