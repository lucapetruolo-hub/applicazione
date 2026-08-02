"use client";

import { useEffect, useState } from "react";
import { Button, Text, XStack, YStack, brand } from "@professionisti/ui";

const textareaStyle = {
  padding: 10,
  borderRadius: 4,
  border: `1px solid ${brand.filetto}`,
  fontSize: 14,
  fontFamily: "inherit",
  color: brand.grafite,
  resize: "vertical" as const,
  width: "100%",
};

/**
 * "Annulla intervento" (richiesta esplicita dell'utente): a differenza del
 * generico cambio di stato nel calendario, raccoglie una nota facoltativa
 * per il cliente che spieghi il motivo dell'annullamento — stesso pattern
 * overlay di AcceptQuoteModal/CompleteJobModal.
 */
export function CancelBookingModal({ onClose, onCancel }: { onClose: () => void; onCancel: (note: string | undefined) => Promise<void> }) {
  const [note, setNote] = useState("");
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
      await onCancel(note.trim() || undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore imprevisto, riprova.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Annulla intervento"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(20,24,30,0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        padding: 16,
        overflowY: "auto",
      }}
    >
      <YStack
        onPress={(e: { stopPropagation: () => void }) => e.stopPropagation()}
        width="100%"
        maxWidth={480}
        backgroundColor={brand.calce}
        borderRadius="$3"
        borderWidth={1.5}
        borderColor={brand.urgenza}
        padding="$5"
        gap="$4"
        marginVertical="$6"
      >
        <YStack gap="$1">
          <Text fontFamily="$heading" fontWeight="800" fontSize="$6" color={brand.grafite}>
            Annulla intervento
          </Text>
          <Text fontSize="$3" color={brand.grafite70}>
            Il cliente verrà avvisato dell&apos;annullamento. Puoi lasciare una nota facoltativa per spiegargli il motivo.
          </Text>
        </YStack>

        <YStack gap="$2">
          <Text fontFamily="$mono" fontSize={11} fontWeight="500" letterSpacing={0.8} textTransform="uppercase" color={brand.grafite70}>
            Nota per il cliente (facoltativa)
          </Text>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Es. Imprevisto, ti ricontatterò per riprogrammare."
            rows={3}
            style={textareaStyle}
          />
        </YStack>

        {error ? (
          <Text color={brand.urgenza} fontSize="$3">
            {error}
          </Text>
        ) : null}

        <XStack gap="$2" flexWrap="wrap">
          <Button variant="urgent" size="$3" height={44} onPress={handleSubmit} disabled={isSaving} opacity={isSaving ? 0.6 : 1}>
            {isSaving ? "Annullamento..." : "Conferma annullamento"}
          </Button>
          <Button variant="ghost" size="$3" height={44} onPress={onClose} disabled={isSaving}>
            Torna indietro
          </Button>
        </XStack>
      </YStack>
    </div>
  );
}
