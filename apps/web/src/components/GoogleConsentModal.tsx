"use client";

import { useEffect, useState } from "react";
import { Button, Text, XStack, YStack, brand } from "@professionisti/ui";
import { LegalConsentCheckbox } from "./LegalConsentCheckbox";
import { closeOnBackdrop } from "@/lib/closeOnBackdrop";

/**
 * Popup mostrato subito dopo aver ottenuto le credenziali da Google —
 * richiesta esplicita dell'utente: il pulsante "Continua con Google" deve
 * restare sempre cliccabile fin da subito (prima era disabilitato finché
 * non si spuntavano le due caselle nel form, bloccando l'azione più rapida
 * proprio nel percorso pensato per essere il più veloce), l'accettazione
 * delle due clausole (Privacy Policy/Termini di Servizio + maggiore età,
 * "Verbale di Conformità") avviene qui, dopo il login Google e prima di
 * completare la registrazione (dal §289 una sola casella, LegalConsentCheckbox)
 * — mai una registrazione portata a termine
 * senza consenso esplicito, solo il momento in cui viene chiesto cambia.
 * Stesso pattern overlay `role="dialog"` già in uso ovunque nel prodotto
 * (chiusura su Escape/click sul backdrop, stop della propagazione sul
 * contenuto).
 */
export function GoogleConsentModal({
  consent,
  onToggleConsent,
  onConfirm,
  onCancel,
  isSubmitting,
  error,
}: {
  consent: boolean;
  onToggleConsent: () => void;
  onConfirm: () => void;
  onCancel: () => void;
  isSubmitting?: boolean;
  error?: string | null;
}) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);

  // "Accetta e continua" resta premibile: senza spunta la casella diventa
  // rossa (docs/CHANGELOG.md §248, come in /registrati).
  const [attempt, setAttempt] = useState(0);

  function handleConfirm() {
    if (!consent) {
      setAttempt((n) => n + 1);
      return;
    }
    onConfirm();
  }

  return (
    <div
      role="presentation"
      onClick={closeOnBackdrop(onCancel)}
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(43,32,19,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        zIndex: 400,
      }}
    >
      <div role="dialog" aria-modal="true" aria-label="Accetta Privacy Policy e Termini di Servizio" style={{ width: "100%", maxWidth: 420 }}>
        <YStack width="100%" backgroundColor={brand.calce} borderRadius="$5" padding="$5" gap="$4">
          <YStack gap="$1">
            <Text fontFamily="$body" fontSize={13} fontWeight="700" color={brand.cianografiaScuro}>
              Un&apos;ultima cosa
            </Text>
            <Text fontFamily="$heading" fontWeight="800" fontSize="$6" color={brand.grafite}>
              Prima di continuare
            </Text>
            <Text fontSize={16} color={brand.grafite70}>
              L&apos;accesso con Google è andato a buon fine. Per completare la registrazione spunta la casella.
            </Text>
          </YStack>

          <LegalConsentCheckbox id="consenso-google" checked={consent} onToggle={onToggleConsent} attempt={attempt} />

          {error ? (
            <Text color={brand.urgenza} fontSize={16}>
              {error}
            </Text>
          ) : null}

          <XStack gap="$3">
            <Button variant="secondary" flex={1} onPress={onCancel} disabled={isSubmitting}>
              Annulla
            </Button>
            <Button variant="scuro" flex={1} onPress={handleConfirm} disabled={isSubmitting} opacity={isSubmitting ? 0.6 : 1}>
              {isSubmitting ? "Un momento..." : "Accetta e continua"}
            </Button>
          </XStack>
        </YStack>
      </div>
    </div>
  );
}
