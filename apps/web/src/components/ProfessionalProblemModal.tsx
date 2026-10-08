"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { X } from "lucide-react";
import { PROFESSIONAL_JOB_PROBLEM_REASONS, type ProfessionalJobProblemReason, type ReportProfessionalJobProblemInput } from "@professionisti/shared";
import { Button, Text, XStack, YStack, brand } from "@professionisti/ui";
import { MediaPreview } from "@/components/MediaPreview";
import { UploadingDots } from "@/components/UploadingDots";

const MAX_PHOTOS = 5;

const fieldStyle = {
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
 * "Qualcosa è andato male" del professionista (richiesta esplicita
 * dell'utente, docs/CHANGELOG.md §197): motivo, descrizione e foto/video
 * facoltativi. La segnalazione va in chat al cliente e al nostro team.
 * Stesso overlay di `ReportIssueModal` (allineato in alto, CLAUDE.md §35).
 */
export function ProfessionalProblemModal({
  clientName,
  onClose,
  onSubmit,
  uploadPhoto,
}: {
  clientName: string;
  onClose: () => void;
  onSubmit: (input: ReportProfessionalJobProblemInput) => Promise<void>;
  uploadPhoto: (file: File) => Promise<string>;
}) {
  const [reason, setReason] = useState<ProfessionalJobProblemReason>(PROFESSIONAL_JOB_PROBLEM_REASONS[0].value);
  const [description, setDescription] = useState("");
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  async function handlePhoto(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    setIsUploading(true);
    try {
      const url = await uploadPhoto(file);
      setPhotoUrls((prev) => [...prev, url].slice(0, MAX_PHOTOS));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore durante il caricamento.");
    } finally {
      setIsUploading(false);
    }
  }

  async function handleSubmit() {
    setError(null);
    if (description.trim().length < 10) {
      setError("Descrivi cosa è successo (almeno 10 caratteri).");
      return;
    }
    setIsSaving(true);
    try {
      await onSubmit({ reason, description: description.trim(), photoUrls });
      setSent(true);
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
      aria-label="Qualcosa è andato male"
      style={{
        position: "fixed",
        inset: 0,
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
        maxWidth={480}
        backgroundColor={brand.calce}
        borderRadius="$3"
        borderWidth={1.5}
        borderColor={brand.urgenza}
        padding="$5"
        gap="$4"
        marginVertical="$6"
      >
        {sent ? (
          <YStack gap="$3">
            <Text fontFamily="$heading" fontWeight="800" fontSize="$6" color={brand.grafite}>
              Segnalazione inviata
            </Text>
            <Text fontSize="$3" color={brand.grafite70}>
              L&apos;abbiamo scritta in chat a {clientName} e la verificheremo il prima possibile.
            </Text>
            <Button variant="secondary" size="$3" onPress={onClose}>
              Chiudi
            </Button>
          </YStack>
        ) : (
          <>
            <YStack gap="$1">
              <Text fontFamily="$heading" fontWeight="800" fontSize="$6" color={brand.grafite}>
                Qualcosa è andato male?
              </Text>
              <Text fontSize="$3" color={brand.grafite70}>
                Raccontaci cosa è successo con {clientName}. Lo scriviamo anche in chat al cliente e lo legge il nostro team.
              </Text>
            </YStack>

            <YStack gap="$2">
              <Text fontFamily="$body" fontSize={11} fontWeight="700" color={brand.grafite70}>
                Motivo
              </Text>
              <select value={reason} onChange={(e) => setReason(e.target.value as ProfessionalJobProblemReason)} style={fieldStyle}>
                {PROFESSIONAL_JOB_PROBLEM_REASONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </YStack>

            <YStack gap="$2">
              <Text fontFamily="$body" fontSize={11} fontWeight="700" color={brand.grafite70}>
                Cosa è successo
              </Text>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Racconta in breve cosa è successo."
                rows={4}
                maxLength={1000}
                style={{ ...fieldStyle, resize: "vertical" }}
              />
            </YStack>

            <YStack gap="$1">
              <Text fontSize="$2" color={brand.grafite70}>
                Foto o video (facoltativi, fino a {MAX_PHOTOS})
              </Text>
              <XStack flexWrap="wrap" gap="$2">
                {photoUrls.map((url) => (
                  <YStack key={url} width={64} height={64} borderRadius="$3" overflow="hidden" position="relative" borderWidth={1} borderColor={brand.filetto}>
                    <MediaPreview url={url} />
                    <YStack
                      position="absolute"
                      top={2}
                      right={2}
                      width={18}
                      height={18}
                      borderRadius={9}
                      backgroundColor="rgba(20,24,30,0.7)"
                      alignItems="center"
                      justifyContent="center"
                      cursor="pointer"
                      onPress={() => setPhotoUrls((prev) => prev.filter((u) => u !== url))}
                      accessibilityRole="button"
                      accessibilityLabel="Rimuovi foto"
                    >
                      <X size={11} strokeWidth={2} color="white" />
                    </YStack>
                  </YStack>
                ))}
                {photoUrls.length < MAX_PHOTOS ? (
                  <YStack
                    width={64}
                    height={64}
                    borderRadius="$3"
                    borderWidth={1}
                    borderColor={brand.filetto}
                    borderStyle="dashed"
                    alignItems="center"
                    justifyContent="center"
                    cursor="pointer"
                    opacity={isUploading ? 0.6 : 1}
                    onPress={() => !isUploading && inputRef.current?.click()}
                    accessibilityRole="button"
                    accessibilityLabel="Aggiungi foto"
                  >
                    {isUploading ? (
                      <UploadingDots dotSize={6} />
                    ) : (
                      <Text fontSize="$6" color={brand.grafite70}>
                        +
                      </Text>
                    )}
                  </YStack>
                ) : null}
              </XStack>
              <input ref={inputRef} type="file" accept="image/*,video/*" onChange={handlePhoto} disabled={isUploading} style={{ display: "none" }} />
            </YStack>

            {error ? (
              <Text color={brand.urgenza} fontSize="$3">
                {error}
              </Text>
            ) : null}

            <XStack gap="$2" flexWrap="wrap">
              <Button variant="urgent" size="$3" height={44} onPress={handleSubmit} disabled={isSaving || isUploading} opacity={isSaving ? 0.6 : 1}>
                {isSaving ? "Invio..." : "Invia segnalazione"}
              </Button>
              <Button variant="ghost" size="$3" height={44} onPress={onClose} disabled={isSaving}>
                Annulla
              </Button>
            </XStack>
          </>
        )}
      </YStack>
    </div>
  );
}
