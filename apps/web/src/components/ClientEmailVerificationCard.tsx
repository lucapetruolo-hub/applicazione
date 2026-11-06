"use client";

import { useEffect, useRef, useState } from "react";
import { Button, Surface, Text, YStack, brand } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/lib/AuthContext";
import { EmailCodeForm } from "@/components/EmailCodeForm";

/**
 * Conferma email facoltativa per il cliente (decisione dell'utente,
 * docs/CHANGELOG.md §178): nessun blocco, solo un invito in /account. Chi
 * conferma compare ai professionisti con "Email confermata" sulla
 * richiesta, il motivo per cui il riquadro parla di più affidabilità.
 *
 * Lo stesso riquadro, con `title`/`text`/`autoSend`/`onVerified`, chiede la
 * conferma nella finestra "Prima di accettare" quando è obbligatoria
 * (docs/changelog/2026-11-05-verifica-email-cliente.md): l'email parte da
 * sola e, appena confermata, l'accettazione riprende.
 */
export function ClientEmailVerificationCard({
  title = "Conferma la tua email",
  text = "Così ricevi più risposte dai professionisti.",
  autoSend = false,
  allowChangeEmail = false,
  onVerified,
}: {
  title?: string;
  text?: string;
  /** Manda subito l'email di conferma, senza il pulsante. */
  autoSend?: boolean;
  /** "Email sbagliata? Correggila", che manda subito una nuova email. */
  allowChangeEmail?: boolean;
  /** Dopo la conferma, con l'utente già aggiornato. */
  onVerified?: () => void;
} = {}) {
  const { user, token, refreshUser } = useAuth();
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [timing, setTiming] = useState<{ resendIn: number; validFor?: number; linkValidFor?: number }>({ resendIn: 60 });

  const autoSent = useRef(false);
  const hidden = !user || !token || user.isProfessional || user.emailVerified || !user.email;

  const send = async () => {
    if (!token) return;
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

  useEffect(() => {
    if (!autoSend || hidden || autoSent.current) return;
    autoSent.current = true;
    void send();
    // Una volta sola all'apertura.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSend, hidden]);

  if (hidden || !user?.email || !token) return null;

  return (
    <Surface gap="3" borderLeftWidth={4} borderLeftColor={brand.cianografia} role="status">
      <YStack gap="1">
        <Text fontFamily="heading" fontWeight="800" fontSize="6" color={brand.grafite}>
          {title}
        </Text>
        <Text color={brand.grafite70}>
          {/* Una riga sola (docs/CHANGELOG.md §349). */}
          {text}
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
          allowChangeEmail={allowChangeEmail}
          onVerified={() =>
            void refreshUser()
              .catch(() => {})
              .then(() => onVerified?.())
          }
        />
      ) : (
        <YStack gap="2" alignItems="flex-start">
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
