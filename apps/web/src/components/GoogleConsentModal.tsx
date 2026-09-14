"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button, Icon, Text, XStack, YStack, brand } from "@professionisti/ui";

/**
 * Casella di spunta compatta per le due dichiarazioni obbligatorie — stessa
 * resa già duplicata in /registrati e InlineAuthGate (componente piccolo,
 * non vale introdurre una dipendenza tra i file solo per questo), qui una
 * terza copia per lo stesso motivo: questo popup è montato da entrambi.
 */
function ConsentCheckbox({ checked, onToggle, children }: { checked: boolean; onToggle: () => void; children: React.ReactNode }) {
  return (
    <XStack alignItems="flex-start" gap="$2" cursor="pointer" onPress={onToggle} accessibilityRole="checkbox" accessibilityState={{ checked }}>
      <YStack
        width={18}
        height={18}
        marginTop={2}
        borderRadius="$1"
        borderWidth={2}
        borderColor={checked ? brand.cianografia : brand.filetto}
        backgroundColor={checked ? brand.cianografia : brand.calce}
        alignItems="center"
        justifyContent="center"
        flexShrink={0}
      >
        {checked ? <Icon name="check" size={12} strokeWidth={2.5} color="white" /> : null}
      </YStack>
      <Text fontSize="$2" color={brand.grafite70} lineHeight={18}>
        {children}
      </Text>
    </XStack>
  );
}

/**
 * Popup mostrato subito dopo aver ottenuto le credenziali da Google —
 * richiesta esplicita dell'utente: il pulsante "Continua con Google" deve
 * restare sempre cliccabile fin da subito (prima era disabilitato finché
 * non si spuntavano le due caselle nel form, bloccando l'azione più rapida
 * proprio nel percorso pensato per essere il più veloce), l'accettazione
 * delle due clausole (Privacy Policy/Termini di Servizio + maggiore età,
 * "Verbale di Conformità") avviene qui, dopo il login Google e prima di
 * completare la registrazione — mai una registrazione portata a termine
 * senza consenso esplicito, solo il momento in cui viene chiesto cambia.
 * Stesso pattern overlay `role="dialog"` già in uso ovunque nel prodotto
 * (chiusura su Escape/click sul backdrop, stop della propagazione sul
 * contenuto).
 */
export function GoogleConsentModal({
  acceptedLegalTerms,
  declaredAdult,
  onToggleLegalTerms,
  onToggleDeclaredAdult,
  onConfirm,
  onCancel,
  isSubmitting,
  error,
}: {
  acceptedLegalTerms: boolean;
  declaredAdult: boolean;
  onToggleLegalTerms: () => void;
  onToggleDeclaredAdult: () => void;
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

  const canConfirm = acceptedLegalTerms && declaredAdult;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Accetta Privacy Policy e Termini di Servizio"
      onClick={onCancel}
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
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 420 }}>
        <YStack width="100%" backgroundColor={brand.calce} borderRadius="$5" padding="$5" gap="$4">
          <YStack gap="$1">
            <Text fontFamily="$body" fontSize={11} fontWeight="700" color={brand.cianografia}>
              Un&apos;ultima cosa
            </Text>
            <Text fontFamily="$heading" fontWeight="800" fontSize="$6" color={brand.grafite}>
              Prima di continuare
            </Text>
            <Text fontSize="$3" color={brand.grafite70}>
              L&apos;accesso con Google è andato a buon fine. Per completare la registrazione conferma questi due punti.
            </Text>
          </YStack>

          <YStack gap="$3">
            <ConsentCheckbox checked={acceptedLegalTerms} onToggle={onToggleLegalTerms}>
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
            <ConsentCheckbox checked={declaredAdult} onToggle={onToggleDeclaredAdult}>
              Dichiaro di avere almeno 18 anni.
            </ConsentCheckbox>
          </YStack>

          {error ? (
            <Text color={brand.urgenza} fontSize="$3">
              {error}
            </Text>
          ) : null}

          <XStack gap="$3">
            <Button variant="secondary" flex={1} onPress={onCancel} disabled={isSubmitting}>
              Annulla
            </Button>
            <Button variant="primary" flex={1} onPress={onConfirm} disabled={!canConfirm || isSubmitting} opacity={!canConfirm || isSubmitting ? 0.6 : 1}>
              {isSubmitting ? "Un momento..." : "Accetta e continua"}
            </Button>
          </XStack>
        </YStack>
      </div>
    </div>
  );
}
