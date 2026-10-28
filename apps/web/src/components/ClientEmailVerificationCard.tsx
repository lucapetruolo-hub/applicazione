"use client";

import { useState } from "react";
import { Button, Surface, Text, YStack, brand } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/lib/AuthContext";
import { EmailCodeForm } from "@/components/EmailCodeForm";

/**
 * Conferma email facoltativa per il cliente (decisione dell'utente,
 * docs/CHANGELOG.md §178): nessun blocco, solo un invito in /account. Chi
 * conferma compare ai professionisti con "Email confermata" sulla
 * richiesta, il motivo per cui il riquadro parla di più affidabilità.
 */
export function ClientEmailVerificationCard() {
  const { user, token, refreshUser } = useAuth();
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [timing, setTiming] = useState<{ resendIn: number; validFor?: number; linkValidFor?: number }>({ resendIn: 60 });

  if (!user || !token || user.isProfessional || user.emailVerified || !user.email) return null;

  const send = async () => {
    setState("sending");
    setError(null);
    try {
      await apiClient.resendVerificationEmail(token);
      setTiming({ resendIn: 60 });
      setState("sent");
    } catch (err) {
      // Un'email mandata da poco (es. da un'altra scheda) è ancora buona:
      // si apre l'attesa della conferma invece di un errore senza uscita.
      const me = await apiClient.me(token).catch(() => null);
      if (me && me.emailLinkValidForSeconds > 0) {
        setTiming({ resendIn: me.emailCodeResendInSeconds, validFor: me.emailCodeValidForSeconds, linkValidFor: me.emailLinkValidForSeconds });
        setState("sent");
        return;
      }
      setError(err instanceof Error ? err.message : "Invio non riuscito, riprova tra qualche minuto.");
      setState("error");
    }
  };

  return (
    <Surface gap="$3" borderLeftWidth={4} borderLeftColor={brand.cianografia} role="status">
      <YStack gap="$1">
        <Text fontFamily="$heading" fontWeight="800" fontSize="$6" color={brand.grafite}>
          Conferma la tua email
        </Text>
        <Text color={brand.grafite70}>
          {/* Una riga sola (docs/CHANGELOG.md §349). */}
          Così ricevi più risposte dai professionisti.
        </Text>
      </YStack>
      {state === "sent" ? (
        <EmailCodeForm
          token={token}
          email={user.email}
          initialResendSeconds={timing.resendIn}
          initialValidForSeconds={timing.validFor}
          initialLinkValidForSeconds={timing.linkValidFor}
          linkFirst
          onVerified={() => void refreshUser().catch(() => {})}
        />
      ) : (
        <YStack gap="$2" alignItems="flex-start">
          <Button variant="primary" onPress={send} disabled={state === "sending"} opacity={state === "sending" ? 0.6 : 1}>
            {state === "sending" ? "Invio..." : "Mandami l'email di conferma"}
          </Button>
          {state === "error" ? (
            <Text color={brand.urgenza} fontSize={16}>
              {error}
            </Text>
          ) : null}
        </YStack>
      )}
    </Surface>
  );
}
