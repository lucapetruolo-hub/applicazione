"use client";

import { useState, useRef } from "react";
import { useDialogFocus } from "@/lib/useDialogFocus";
import { Button, Text, XStack, YStack, brand } from "@professionisti/ui";
import { closeOnBackdrop } from "@/lib/closeOnBackdrop";
import { ButtonWaitBar } from "@/components/WaitBar";
import { LearnMore } from "@/components/LearnMore";

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

  // Fuoco dentro, Tab chiuso nella finestra, Esc chiude, fuoco restituito alla chiusura (lib/useDialogFocus.ts).
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogFocus(dialogRef, onClose);

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
        ref={dialogRef as never} role="dialog"
        aria-modal
        aria-label="Lavoro terminato"
        width="100%"
        maxWidth={480}
        backgroundColor={brand.calce}
        borderRadius="3"
        borderWidth={1}
        borderColor={brand.filetto}
        padding="5"
        gap="4"
        marginVertical="6"
      >
        <YStack gap="2">
          <Text fontFamily="heading" fontWeight="800" fontSize="6" color={brand.grafite}>
            Il lavoro è finito e va bene?
          </Text>
          {/* Poche parole e in positivo (docs/changelog/2026-11-19-conferma-lavoro-terminato-semplice.md):
              "C'è un problema" sta già accanto a "Lavoro terminato" sulla scheda. */}
          <LearnMore
            fontSize={16}
            summary={
              directPayment
                ? "Confermando dici anche di aver pagato il professionista. Poi puoi lasciare una recensione."
                : "Subito dopo puoi lasciare una recensione, anche con foto."
            }
          >
            <Text fontSize={15} color={brand.grafite70}>
              Confermando accetti il lavoro. Dopo, per un problema puoi scrivere in chat al professionista, ma il sito non
              può più rimborsare. Se qualcosa non va, premi Annulla e usa “C’è un problema” sulla scheda.
            </Text>
          </LearnMore>
        </YStack>

        {error ? (
          <Text color={brand.urgenza} fontSize={16}>
            {error}
          </Text>
        ) : null}

        <XStack gap="2" flexWrap="wrap">
          <Button variant="primary" size="3" height={44} onPress={handleSubmit} disabled={isSaving}>
            Sì, conferma
            {isSaving ? <ButtonWaitBar label="Conferma in corso…" /> : null}
          </Button>
          <Button variant="ghost" size="3" height={44} onPress={onClose} disabled={isSaving}>
            Annulla
          </Button>
        </XStack>
      </YStack>
    </div>
  );
}
