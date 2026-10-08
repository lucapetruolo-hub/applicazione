"use client";

import { useEffect, useState } from "react";
import type { ContentReportTargetType } from "@professionisti/shared";
import { Button, Text, XStack, YStack, brand } from "@professionisti/ui";

const REASON_OPTIONS: { value: string; label: string }[] = [
  { value: "contenuto-falso", label: "Informazioni false o ingannevoli" },
  { value: "contenuto-offensivo", label: "Linguaggio offensivo o discriminatorio" },
  { value: "spam", label: "Spam o contenuto promozionale non pertinente" },
  { value: "privacy", label: "Espone dati personali di terzi" },
  { value: "altro", label: "Altro motivo" },
];

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

const selectStyle = {
  padding: 10,
  borderRadius: 4,
  border: `1px solid ${brand.filetto}`,
  fontSize: 14,
  fontFamily: "inherit",
  color: brand.grafite,
  backgroundColor: brand.calce,
  width: "100%",
};

/**
 * Meccanismo di segnalazione contenuti (richiesta esplicita dell'utente,
 * "Verbale di Conformità" — notice-and-action, Reg. (UE) 2022/2065 art. 16):
 * un solo componente condiviso per i tre tipi di contenuto segnalabile
 * (profilo professionista, recensione, recensione sul cliente) — lo stesso
 * pattern overlay già in uso in `CancelBookingModal`/`CompleteJobModal`, qui
 * con `alignItems: "flex-start"` fin da subito (non "center") per evitare
 * strutturalmente il bug di scroll già documentato e corretto altrove
 * (CLAUDE.md §35), invece di introdurlo di nuovo in un componente nuovo.
 */
export function ReportContentModal({
  targetType,
  targetLabel,
  onClose,
  onSubmit,
}: {
  targetType: ContentReportTargetType;
  /** Nome leggibile di cosa si sta segnalando (es. "il profilo di Mario Rossi"), mostrato nel testo. */
  targetLabel: string;
  onClose: () => void;
  onSubmit: (reason: string, details: string | undefined) => Promise<void>;
}) {
  const [reasonValue, setReasonValue] = useState(REASON_OPTIONS[0]!.value);
  const [details, setDetails] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  async function handleSubmit() {
    setError(null);
    setIsSubmitting(true);
    try {
      const reasonLabel = REASON_OPTIONS.find((option) => option.value === reasonValue)?.label ?? reasonValue;
      await onSubmit(reasonLabel, details.trim() || undefined);
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore imprevisto, riprova.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Segnala contenuto"
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
        onPress={(e: { stopPropagation: () => void }) => e.stopPropagation()}
        width="100%"
        maxWidth={460}
        backgroundColor={brand.calce}
        borderRadius="$3"
        borderWidth={1.5}
        borderColor={brand.urgenza}
        padding="$5"
        gap="$4"
        marginVertical="$6"
      >
        {done ? (
          <YStack gap="$3">
            <Text fontFamily="$heading" fontWeight="800" fontSize="$6" color={brand.grafite}>
              Segnalazione inviata
            </Text>
            <Text fontSize="$3" color={brand.grafite70}>
              Grazie, la verificheremo il prima possibile.
            </Text>
            <Button variant="secondary" size="$3" onPress={onClose}>
              Chiudi
            </Button>
          </YStack>
        ) : (
          <>
            <YStack gap="$1">
              <Text fontFamily="$heading" fontWeight="800" fontSize="$6" color={brand.grafite}>
                Segnala {targetLabel}
              </Text>
              <Text fontSize="$3" color={brand.grafite70}>
                Ci aiuta a mantenere la piattaforma affidabile per tutti.
              </Text>
            </YStack>

            <YStack gap="$2">
              <Text fontFamily="$body" fontSize={11} fontWeight="700" color={brand.grafite70}>
                Motivo
              </Text>
              <select value={reasonValue} onChange={(e) => setReasonValue(e.target.value)} style={selectStyle}>
                {REASON_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </YStack>

            <YStack gap="$2">
              <Text fontFamily="$body" fontSize={11} fontWeight="700" color={brand.grafite70}>
                Dettagli (facoltativi)
              </Text>
              <textarea
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                placeholder="Aggiungi altri dettagli utili, se vuoi."
                rows={3}
                maxLength={1000}
                style={textareaStyle}
              />
            </YStack>

            {error ? (
              <Text color={brand.urgenza} fontSize="$3">
                {error}
              </Text>
            ) : null}

            <XStack gap="$2" flexWrap="wrap">
              <Button variant="urgent" size="$3" onPress={handleSubmit} disabled={isSubmitting} opacity={isSubmitting ? 0.6 : 1}>
                {isSubmitting ? "Invio..." : "Invia segnalazione"}
              </Button>
              <Button variant="ghost" size="$3" onPress={onClose} disabled={isSubmitting}>
                Annulla
              </Button>
            </XStack>
          </>
        )}
      </YStack>
    </div>
  );
}
