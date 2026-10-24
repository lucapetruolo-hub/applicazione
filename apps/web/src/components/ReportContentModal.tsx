"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CONTENT_REPORT_REASONS, contentReportReason, type ContentReportReasonCode, type ContentReportTargetType } from "@professionisti/shared";
import { Button, Text, XStack, YStack, brand } from "@professionisti/ui";
import { ConsentCheckbox } from "./ConsentCheckbox";
import { closeOnBackdrop } from "@/lib/closeOnBackdrop";

const textareaStyle = {
  padding: 10,
  borderRadius: 10,
  border: `1px solid ${brand.bordoCampo}`,
  fontSize: 16,
  fontFamily: "inherit",
  color: brand.grafite,
  resize: "vertical" as const,
  width: "100%",
};

const selectStyle = {
  padding: 10,
  borderRadius: 10,
  border: `1px solid ${brand.bordoCampo}`,
  fontSize: 16,
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
  targetLabel,
  onClose,
  onSubmit,
}: {
  targetType: ContentReportTargetType;
  /** Nome leggibile di cosa si sta segnalando (es. "il profilo di Mario Rossi"), mostrato nel testo. */
  targetLabel: string;
  onClose: () => void;
  onSubmit: (input: { reason: ContentReportReasonCode; details: string | undefined; goodFaith: boolean }) => Promise<void>;
}) {
  // Nessun motivo già scelto: dice se il contenuto è illegale, non va dato per scontato.
  const [reasonValue, setReasonValue] = useState<ContentReportReasonCode | "">("");
  const [details, setDetails] = useState("");
  const [goodFaith, setGoodFaith] = useState(false);
  const [attempted, setAttempted] = useState(false);
  // Contenuto illegale (DSA art. 16 c. 2, docs/CHANGELOG.md §319): servono
  // una spiegazione e la dichiarazione di buona fede.
  const illegal = reasonValue ? (contentReportReason(reasonValue)?.illegal ?? false) : false;
  const detailsMissing = illegal && details.trim().length < 10;
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
    if (!reasonValue || (illegal && (detailsMissing || !goodFaith))) {
      setAttempted(true);
      return;
    }
    setIsSubmitting(true);
    try {
      await onSubmit({ reason: reasonValue, details: details.trim() || undefined, goodFaith: illegal && goodFaith });
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore imprevisto, riprova.");
    } finally {
      setIsSubmitting(false);
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
        aria-label="Segnala contenuto"
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
            <Text fontSize={16} color={brand.grafite70}>
              Grazie, l&apos;abbiamo presa in carico.
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
              <Text fontSize={16} color={brand.grafite70}>
                Ci aiuta a mantenere la piattaforma affidabile per tutti.
              </Text>
            </YStack>

            <YStack gap="$2">
              <Text fontFamily="$body" fontSize={13} fontWeight="700" color={brand.grafite70}>
                Motivo
              </Text>
              <select
                aria-label="Motivo"
                aria-invalid={(attempted && !reasonValue) || undefined}
                value={reasonValue}
                onChange={(e) => setReasonValue(e.target.value as ContentReportReasonCode)}
                style={{ ...selectStyle, ...(attempted && !reasonValue ? { border: `1px solid ${brand.urgenza}` } : {}) }}
              >
                <option value="" disabled>
                  Scegli il motivo
                </option>
                <optgroup label="È illegale">
                  {CONTENT_REPORT_REASONS.filter((r) => r.illegal).map((option) => (
                    <option key={option.code} value={option.code}>
                      {option.label}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Non rispetta le regole del sito">
                  {CONTENT_REPORT_REASONS.filter((r) => !r.illegal).map((option) => (
                    <option key={option.code} value={option.code}>
                      {option.label}
                    </option>
                  ))}
                </optgroup>
              </select>
              {attempted && !reasonValue ? (
                <Text color={brand.urgenza} fontSize={13}>
                  Scegli il motivo.
                </Text>
              ) : null}
            </YStack>

            <YStack gap="$2">
              <Text fontFamily="$body" fontSize={13} fontWeight="700" color={brand.grafite70}>
                {illegal ? "Perché è illegale?" : "Dettagli (facoltativi)"}
              </Text>
              <textarea
                aria-label={illegal ? "Perché è illegale" : "Dettagli"}
                aria-invalid={(attempted && detailsMissing) || undefined}
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                placeholder={illegal ? "Spiega in poche parole cosa c'è di illegale." : "Aggiungi altri dettagli utili, se vuoi."}
                rows={3}
                maxLength={1000}
                style={{ ...textareaStyle, ...(attempted && detailsMissing ? { border: `1px solid ${brand.urgenza}` } : {}) }}
              />
              {attempted && detailsMissing ? (
                <Text color={brand.urgenza} fontSize={13}>
                  Scrivi almeno qualche parola.
                </Text>
              ) : null}
            </YStack>

            {illegal ? (
              <ConsentCheckbox checked={goodFaith} invalid={attempted} onToggle={() => setGoodFaith((v) => !v)}>
                Confermo in buona fede che la segnalazione è corretta e completa.{" "}
                <Link href="/termini#segnalazioni" target="_blank" style={{ color: brand.cianografiaScuro }} onClick={(e) => e.stopPropagation()}>
                  Come gestiamo le segnalazioni
                </Link>
              </ConsentCheckbox>
            ) : null}

            {error ? (
              <Text color={brand.urgenza} fontSize={16}>
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
