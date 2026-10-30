"use client";

import { useEffect, useState } from "react";
import { Button, Text, XStack, YStack, brand } from "@professionisti/ui";
import { closeOnBackdrop } from "@/lib/closeOnBackdrop";

/**
 * Conferma del cliente che il lavoro è davvero terminato dal suo lato
 * (richiesta esplicita dell'utente: "servono i completed da entrambi"). Solo
 * la conferma: note e foto tolte (docs/CHANGELOG.md §340, decisione
 * dell'utente) perché le leggeva solo l'admin e subito dopo la recensione
 * chiede di nuovo testo e foto. Per un problema c'è "Segnala un problema".
 * Col pagamento diretto la conferma vale anche come "ho pagato"
 * (`JobPaymentsService.confirmDirect`): lo diciamo in mezza riga.
 */
export function ClientCompleteModal({
  directPayment,
  onClose,
  onConfirm,
}: {
  directPayment: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  async function handleSubmit() {
    setError(null);
    setIsSaving(true);
    try {
      await onConfirm();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore imprevisto, riprova.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div
      role="presentation"
      onClick={closeOnBackdrop(onClose)}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(20,24,30,0.55)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        zIndex: 1000,
        padding: 16,
        overflowY: "auto",
      }}
    >
      <YStack
        role="dialog"
        aria-modal
        aria-label="Lavoro terminato"
        width="100%"
        maxWidth={480}
        backgroundColor={brand.calce}
        borderRadius="$3"
        borderWidth={1}
        borderColor={brand.filetto}
        padding="$5"
        gap="$4"
        marginVertical="$6"
      >
        <YStack gap="$1">
          <Text fontFamily="$heading" fontWeight="800" fontSize="$6" color={brand.grafite}>
            Confermi che il lavoro è terminato?
          </Text>
          <Text fontSize={16} color={brand.grafite70}>
            {directPayment ? "Confermando dichiari di aver pagato il professionista. " : ""}
            Confermando accetti il lavoro: dopo non potrai più segnalare un problema. Subito dopo potrai lasciare una recensione, anche con foto.
          </Text>
        </YStack>

        {error ? (
          <Text color={brand.urgenza} fontSize={16}>
            {error}
          </Text>
        ) : null}

        <XStack gap="$2" flexWrap="wrap">
          <Button variant="primary" size="$3" height={44} onPress={handleSubmit} disabled={isSaving} opacity={isSaving ? 0.6 : 1}>
            {isSaving ? "Conferma..." : "Conferma lavoro terminato"}
          </Button>
          <Button variant="ghost" size="$3" height={44} onPress={onClose} disabled={isSaving}>
            Annulla
          </Button>
        </XStack>
      </YStack>
    </div>
  );
}
